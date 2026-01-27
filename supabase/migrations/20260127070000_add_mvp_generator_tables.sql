-- Create mvp_landing_pages table
create table public.mvp_landing_pages (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  validation_id uuid references public.validations(id) on delete set null,
  slug text not null,
  content jsonb not null default '{}'::jsonb,
  theme text not null default 'default',
  is_published boolean not null default false,
  view_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint mvp_landing_pages_pkey primary key (id),
  constraint mvp_landing_pages_slug_key unique (slug)
);

-- Create mvp_leads table
create table public.mvp_leads (
  id uuid not null default gen_random_uuid(),
  landing_page_id uuid not null references public.mvp_landing_pages(id) on delete cascade,
  email text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint mvp_leads_pkey primary key (id)
);

-- Enable RLS
alter table public.mvp_landing_pages enable row level security;
alter table public.mvp_leads enable row level security;

-- Policies for mvp_landing_pages

-- Users can create Landing Pages
create policy "Users can insert their own Landing Pages"
on public.mvp_landing_pages for insert
to authenticated
with check ( auth.uid() = user_id );

-- Users can view their own Landing Pages
create policy "Users can view their own Landing Pages"
on public.mvp_landing_pages for select
to authenticated
using ( auth.uid() = user_id );

-- Anyone can view PUBLISHED Landing Pages (Public Access)
create policy "Public can view published Landing Pages"
on public.mvp_landing_pages for select
to anon, authenticated
using ( is_published = true );

-- Users can update their own Landing Pages
create policy "Users can update their own Landing Pages"
on public.mvp_landing_pages for update
to authenticated
using ( auth.uid() = user_id );

-- Users can delete their own Landing Pages
create policy "Users can delete their own Landing Pages"
on public.mvp_landing_pages for delete
to authenticated
using ( auth.uid() = user_id );


-- Policies for mvp_leads

-- Public (Visitors) can insert Leads (Sign up)
create policy "Public can insert leads"
on public.mvp_leads for insert
to anon, authenticated
with check ( true );

-- Landing Page Owners can view Leads
create policy "Owners can view leads"
on public.mvp_leads for select
to authenticated
using (
  exists (
    select 1 from public.mvp_landing_pages
    where mvp_landing_pages.id = mvp_leads.landing_page_id
    and mvp_landing_pages.user_id = auth.uid()
  )
);

-- Create Indexes
create index idx_mvp_landing_pages_user_id on public.mvp_landing_pages(user_id);
create index idx_mvp_landing_pages_slug on public.mvp_landing_pages(slug);
create index idx_mvp_leads_landing_page_id on public.mvp_leads(landing_page_id);
