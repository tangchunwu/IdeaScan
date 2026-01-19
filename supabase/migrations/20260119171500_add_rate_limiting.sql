-- Create rate_limits table
create table "public"."rate_limits" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null references auth.users(id) on delete cascade,
    "key" text not null,
    "first_request" timestamp with time zone default now(),
    "count" integer default 1,
    "window_start" timestamp with time zone default now(),
    primary key ("id"),
    unique ("user_id", "key")
);

-- Enable RLS
alter table "public"."rate_limits" enable row level security;

-- Create policy for internal use (functions can bypass RLS via service role, but good practice)
create policy "Allow service role to manage rate limits"
    on "public"."rate_limits"
    for all
    to service_role
    using (true)
    with check (true);

-- Create RPC function for atomic rate limiting
create or replace function check_rate_limit(
    key_param text,
    limit_count int,
    window_seconds int
)
returns boolean
language plpgsql
security definer
as $$
declare
    current_count int;
    last_window_start timestamp with time zone;
    user_id_param uuid;
begin
    -- Get current user ID
    user_id_param := auth.uid();
    
    if user_id_param is null then
        return false; -- Should be authenticated
    end if;

    -- Upsert and return new values
    insert into public.rate_limits (user_id, key, count, window_start)
    values (user_id_param, key_param, 1, now())
    on conflict (user_id, key)
    do update set
        count = case 
            when public.rate_limits.window_start < now() - (window_seconds || ' seconds')::interval 
            then 1 
            else public.rate_limits.count + 1 
        end,
        window_start = case 
            when public.rate_limits.window_start < now() - (window_seconds || ' seconds')::interval 
            then now() 
            else public.rate_limits.window_start 
        end
    returning count into current_count;

    -- Check if limit exceeded
    if current_count > limit_count then
        return false;
    else
        return true;
    end if;
end;
$$;
