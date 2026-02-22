#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import struct
import traceback
from typing import Optional, Tuple


class SocksBridgeError(Exception):
    pass


async def _read_exact(reader: asyncio.StreamReader, n: int) -> bytes:
    data = await reader.readexactly(n)
    if len(data) != n:
        raise SocksBridgeError("unexpected eof")
    return data


async def _relay(src: asyncio.StreamReader, dst: asyncio.StreamWriter) -> None:
    try:
        while True:
            chunk = await src.read(65536)
            if not chunk:
                break
            dst.write(chunk)
            await dst.drain()
    except Exception:
        pass
    finally:
        try:
            dst.close()
        except Exception:
            pass


def _parse_addr(atyp: int, payload: bytes) -> Tuple[str, bytes]:
    if atyp == 1:  # IPv4
        if len(payload) < 4:
            raise SocksBridgeError("invalid ipv4 addr")
        addr = ".".join(str(b) for b in payload[:4])
        return addr, payload[4:]
    if atyp == 3:  # domain
        if not payload:
            raise SocksBridgeError("invalid domain addr")
        ln = payload[0]
        if len(payload) < 1 + ln:
            raise SocksBridgeError("invalid domain length")
        addr = payload[1 : 1 + ln].decode("utf-8", errors="ignore")
        return addr, payload[1 + ln :]
    if atyp == 4:  # IPv6
        if len(payload) < 16:
            raise SocksBridgeError("invalid ipv6 addr")
        parts = struct.unpack("!8H", payload[:16])
        addr = ":".join(f"{p:x}" for p in parts)
        return addr, payload[16:]
    raise SocksBridgeError("unsupported atyp")


def _encode_addr(addr: str, atyp: int) -> bytes:
    if atyp == 1:
        return bytes(int(x) for x in addr.split("."))
    if atyp == 3:
        raw = addr.encode("utf-8")
        return bytes([len(raw)]) + raw
    if atyp == 4:
        parts = addr.split(":")
        packed = []
        for part in parts:
            packed.append(int(part or "0", 16))
        while len(packed) < 8:
            packed.append(0)
        return struct.pack("!8H", *packed[:8])
    raise SocksBridgeError("unsupported atyp")


async def _connect_upstream_once(
    host: str,
    port: int,
    username: str,
    password: str,
    target_host: str,
    target_port: int,
    target_atyp: int,
) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    reader, writer = await asyncio.open_connection(host, port)

    # greeting: allow both no-auth and username/password, adapt to upstream choice
    writer.write(b"\x05\x02\x00\x02")
    await writer.drain()
    resp = await _read_exact(reader, 2)
    if resp not in (b"\x05\x00", b"\x05\x02"):
        writer.close()
        raise SocksBridgeError(f"upstream auth method rejected: {resp!r}")
    if resp == b"\x05\x02":
        u = username.encode("utf-8")
        p = password.encode("utf-8")
        if len(u) > 255 or len(p) > 255:
            writer.close()
            raise SocksBridgeError("username/password too long")

        # username/password auth
        writer.write(bytes([0x01, len(u)]) + u + bytes([len(p)]) + p)
        await writer.drain()
        auth_resp = await _read_exact(reader, 2)
        # Some tunnel providers return 0x05 0x00 here (treat as auth accepted).
        if auth_resp not in (b"\x01\x00", b"\x05\x00"):
            writer.close()
            raise SocksBridgeError(f"upstream auth failed: {auth_resp!r}")

    dst = _encode_addr(target_host, target_atyp)
    writer.write(b"\x05\x01\x00" + bytes([target_atyp]) + dst + struct.pack("!H", target_port))
    await writer.drain()

    head = await _read_exact(reader, 4)
    if head[1] != 0x00:
        writer.close()
        raise SocksBridgeError(f"upstream connect failed, rep={head[1]}")
    bind_atyp = head[3]
    if bind_atyp == 1:
        await _read_exact(reader, 4 + 2)
    elif bind_atyp == 3:
        ln = (await _read_exact(reader, 1))[0]
        await _read_exact(reader, ln + 2)
    elif bind_atyp == 4:
        await _read_exact(reader, 16 + 2)
    else:
        writer.close()
        raise SocksBridgeError("upstream invalid bind atyp")

    return reader, writer


async def _connect_upstream(
    host: str,
    port: int,
    username: str,
    password: str,
    target_host: str,
    target_port: int,
    target_atyp: int,
    retries: int = 3,
) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    last_err: Optional[Exception] = None
    for idx in range(max(1, retries)):
        try:
            return await _connect_upstream_once(
                host=host,
                port=port,
                username=username,
                password=password,
                target_host=target_host,
                target_port=target_port,
                target_atyp=target_atyp,
            )
        except Exception as exc:
            last_err = exc
            if idx < retries - 1:
                await asyncio.sleep(0.15 * (idx + 1))
                continue
            break
    raise SocksBridgeError(str(last_err) if last_err else "upstream connect failed")


async def handle_client(
    client_reader: asyncio.StreamReader,
    client_writer: asyncio.StreamWriter,
    upstream_host: str,
    upstream_port: int,
    upstream_user: str,
    upstream_pass: str,
) -> None:
    try:
        # client greeting
        head = await _read_exact(client_reader, 2)
        ver, n_methods = head[0], head[1]
        if ver != 0x05:
            raise SocksBridgeError("only socks5 is supported")
        await _read_exact(client_reader, n_methods)
        # local endpoint accepts no-auth
        client_writer.write(b"\x05\x00")
        await client_writer.drain()

        # request
        req_head = await _read_exact(client_reader, 4)
        ver, cmd, _rsv, atyp = req_head
        if ver != 0x05 or cmd != 0x01:
            client_writer.write(b"\x05\x07\x00\x01\x00\x00\x00\x00\x00\x00")
            await client_writer.drain()
            return

        if atyp == 1:
            rest = await _read_exact(client_reader, 4 + 2)
        elif atyp == 3:
            ln = (await _read_exact(client_reader, 1))[0]
            rest = bytes([ln]) + await _read_exact(client_reader, ln + 2)
        elif atyp == 4:
            rest = await _read_exact(client_reader, 16 + 2)
        else:
            raise SocksBridgeError("unsupported atyp")

        target_host, remain = _parse_addr(atyp, rest)
        if len(remain) != 2:
            raise SocksBridgeError("invalid port bytes")
        target_port = struct.unpack("!H", remain)[0]

        up_reader, up_writer = await _connect_upstream(
            host=upstream_host,
            port=upstream_port,
            username=upstream_user,
            password=upstream_pass,
            target_host=target_host,
            target_port=target_port,
            target_atyp=atyp,
        )

        client_writer.write(b"\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00")
        await client_writer.drain()

        t1 = asyncio.create_task(_relay(client_reader, up_writer))
        t2 = asyncio.create_task(_relay(up_reader, client_writer))
        await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
    except Exception as exc:
        print(f"[socks5-bridge] client error: {exc}")
        traceback.print_exc()
        try:
            client_writer.write(b"\x05\x01\x00\x01\x00\x00\x00\x00\x00\x00")
            await client_writer.drain()
        except Exception:
            pass
    finally:
        try:
            client_writer.close()
            await client_writer.wait_closed()
        except Exception:
            pass


async def main() -> None:
    parser = argparse.ArgumentParser(description="Local SOCKS5 no-auth -> upstream SOCKS5 auth bridge")
    parser.add_argument("--listen-host", default="127.0.0.1")
    parser.add_argument("--listen-port", type=int, default=33116)
    parser.add_argument("--upstream-host", required=True)
    parser.add_argument("--upstream-port", type=int, required=True)
    parser.add_argument("--upstream-user", required=True)
    parser.add_argument("--upstream-pass", required=True)
    args = parser.parse_args()

    server = await asyncio.start_server(
        lambda r, w: handle_client(
            r,
            w,
            upstream_host=args.upstream_host,
            upstream_port=args.upstream_port,
            upstream_user=args.upstream_user,
            upstream_pass=args.upstream_pass,
        ),
        host=args.listen_host,
        port=args.listen_port,
    )

    addrs = ", ".join(str(s.getsockname()) for s in (server.sockets or []))
    print(f"[socks5-bridge] listening on {addrs}", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
