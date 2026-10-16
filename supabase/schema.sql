-- LabMaintain schema for Supabase (PostgreSQL)
-- Run in: Supabase Dashboard -> SQL Editor (or `supabase db push`).
-- Column names stay camelCase (quoted) so the API contract matches the original project.

create type user_role           as enum ('admin','hod','technician');
create type equipment_status    as enum ('Working','Under Maintenance','Not Working','Repair Completed','Scrap');
create type maintenance_status  as enum ('Open','In Progress','Resolved','Unrepairable');
create type invitation_role     as enum ('hod','technician');
create type invitation_status   as enum ('pending','accepted','expired');
create type notification_type   as enum ('SYSTEM','MAINTENANCE','INVITATION','EQUIPMENT');

create table departments (
  id bigint generated always as identity primary key,
  "departmentName" varchar(255) not null,
  "departmentCode" varchar(50)  not null unique,
  "hodName" varchar(255),
  status boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table lab_rooms (
  id bigint generated always as identity primary key,
  "departmentId" bigint not null references departments(id),
  "labName" varchar(255) not null,
  "labCode" varchar(50) not null unique,
  "roomNumber" varchar(50),
  floor varchar(50),
  "totalSystems" int not null default 0,
  status boolean not null default true,
  "labImage" varchar(1000),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table users (
  id bigint generated always as identity primary key,
  name varchar(255) not null,
  email varchar(255) not null unique,
  mobile varchar(20),
  password varchar(255) not null,               -- bcrypt hash, set by the API
  role user_role not null,
  "departmentId" bigint references departments(id),
  "assignedLabId" bigint references lab_rooms(id) on delete set null,
  status boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table equipment (
  id bigint generated always as identity primary key,
  "departmentId" bigint not null references departments(id),
  "labRoomId" bigint not null references lab_rooms(id),
  "assetNumber" varchar(100) not null unique,
  "equipmentName" varchar(255) not null,
  "equipmentType" varchar(100) not null,
  brand varchar(100),
  "modelNumber" varchar(100),
  "serialNumber" varchar(100),
  "purchaseDate" date,
  "warrantyExpiry" date,
  price numeric(10,2),
  "supplierName" varchar(255),
  "currentStatus" equipment_status not null default 'Working',
  remarks text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- UNIQUE equipmentId => one-to-one, so PostgREST embeds it as an object (not an array)
create table equipment_configurations (
  id bigint generated always as identity primary key,
  "equipmentId" bigint not null unique references equipment(id) on delete cascade,
  processor varchar(100),
  ram varchar(50),
  storage varchar(100),
  os varchar(100),
  "ipAddress" varchar(50),
  "macAddress" varchar(50),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table equipment_images (
  id bigint generated always as identity primary key,
  "equipmentId" bigint not null references equipment(id) on delete cascade,
  "imageUrl" varchar(500) not null,
  "isPrimary" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table maintenance_logs (
  id bigint generated always as identity primary key,
  "equipmentId" bigint not null references equipment(id) on delete cascade,
  "reportedBy" bigint not null,
  "assignedTo" bigint,
  "issueDescription" text not null,
  "reportedDate" timestamptz not null default now(),
  status maintenance_status not null default 'Open',
  "resolutionDetails" text,
  "resolvedDate" timestamptz,
  "costIncurred" numeric(10,2) not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint fk_logs_reporter   foreign key ("reportedBy") references users(id),
  constraint fk_logs_technician foreign key ("assignedTo") references users(id) on delete set null
);

create table invitations (
  id bigint generated always as identity primary key,
  email varchar(255) not null,
  role invitation_role not null,
  "departmentId" bigint references departments(id),
  token varchar(255) not null unique,
  "expiresAt" timestamptz not null,
  status invitation_status not null default 'pending',
  "invitedBy" bigint not null references users(id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  "recipientId" bigint not null references users(id) on delete cascade,
  "senderId" bigint references users(id) on delete set null,
  title varchar(255) not null,
  message text not null,
  type notification_type not null default 'SYSTEM',
  "isRead" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index on equipment ("departmentId");
create index on equipment ("labRoomId");
create index on maintenance_logs (status);
create index on notifications ("recipientId", "isRead");

-- Keep "updatedAt" fresh (replaces Sequelize's automatic timestamps)
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new."updatedAt" = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['departments','lab_rooms','users','equipment','equipment_configurations',
                           'equipment_images','maintenance_logs','invitations','notifications']
  loop
    execute format('create trigger trg_%1$s_updated before update on %1$s
                    for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- SECURITY: Supabase exposes every public table over a REST API reachable with the anon key.
-- RLS enabled + zero policies = anon/authenticated roles get nothing. The API server uses the
-- service-role key, which bypasses RLS, and enforces RBAC itself.
alter table departments              enable row level security;
alter table lab_rooms                enable row level security;
alter table users                    enable row level security;
alter table equipment                enable row level security;
alter table equipment_configurations enable row level security;
alter table equipment_images         enable row level security;
alter table maintenance_logs         enable row level security;
alter table invitations              enable row level security;
alter table notifications            enable row level security;

-- Bulk provisioning: ONE function call = ONE transaction. Any failure (e.g. duplicate asset tag)
-- rolls the whole batch back. Sequential tags (AID-AIL-001..) and IPv4 increments via inet + int.
create or replace function bulk_generate_systems(
  p_lab_room_id bigint, p_count int, p_base_tag text, p_start_index int, p_base_ip inet,
  p_name text, p_type text, p_brand text, p_model text,
  p_processor text, p_ram text, p_storage text, p_os text
) returns jsonb language plpgsql as $$
declare
  v_lab lab_rooms%rowtype;
  v_eq_id bigint; v_tag text; v_ip text;
  v_out jsonb := '[]'::jsonb;
  i int;
begin
  if p_count < 1 or p_count > 32 then
    raise exception 'systemCount must be between 1 and 32' using errcode = '22023';
  end if;

  select * into v_lab from lab_rooms where id = p_lab_room_id for update;
  if not found then
    raise exception 'Lab room not found' using errcode = 'P0002';
  end if;

  for i in 0 .. p_count - 1 loop
    v_tag := p_base_tag || lpad((p_start_index + i)::text, 3, '0');
    v_ip  := host(p_base_ip + i);

    insert into equipment ("departmentId","labRoomId","assetNumber","equipmentName","equipmentType",
                           brand,"modelNumber","currentStatus")
    values (v_lab."departmentId", v_lab.id, v_tag, p_name, p_type, p_brand, p_model, 'Working')
    returning id into v_eq_id;

    insert into equipment_configurations ("equipmentId", processor, ram, storage, os, "ipAddress")
    values (v_eq_id, p_processor, p_ram, p_storage, p_os, v_ip);

    v_out := v_out || jsonb_build_object('equipmentId', v_eq_id, 'assetNumber', v_tag, 'ipAddress', v_ip);
  end loop;

  update lab_rooms set "totalSystems" = "totalSystems" + p_count where id = p_lab_room_id;
  return v_out;
end $$;

revoke all on function bulk_generate_systems from public, anon, authenticated;
grant execute on function bulk_generate_systems to service_role;

-- Public bucket for equipment / lab photos (uploaded by the API using the service role)
insert into storage.buckets (id, name, public) values ('labmaintain','labmaintain', true)
on conflict (id) do nothing;
