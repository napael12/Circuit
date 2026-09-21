import { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { api } from '../api/client'
import type { AppUser, DataConnection, Role } from '../api/types'
import { StatusBar } from '../components/layout/StatusBar'
import { useBrandingStore } from '../store/branding'
import { ApiKeysPanel } from '../components/manager/ApiKeysPanel'
import { BackupPanel } from '../components/manager/BackupPanel'
import { ConnectionsPanel } from '../components/manager/ConnectionsPanel'
import { CrudTable } from '../components/manager/CrudTable'
import { DashboardsPanel } from '../components/manager/DashboardsPanel'
import { DatastoresPanel } from '../components/manager/DatastoresPanel'
import type { FormField } from '../components/manager/formFields'

const TABS = ['dashboards', 'connections', 'datastores', 'api-keys', 'users', 'roles', 'settings', 'backup'] as const
type TabName = (typeof TABS)[number]

// Mockup: the manager table's leading "identity" column (ID/Name/Username)
// is rendered in the accent color, acting like a link.
const PRIMARY_CELL_CLASS = 'text-blue-600 dark:text-blue-500 font-medium'

function formatLastFirst(lastName: string, firstName: string): string {
  if (!lastName && !firstName) return ''
  if (!lastName) return firstName
  if (!firstName) return lastName
  return `${lastName}, ${firstName}`
}

export function ManagerPage() {
  const appName = useBrandingStore((s) => s.branding.name)
  const [tab, setTab] = useState<TabName>('dashboards')
  const [connections, setConnections] = useState<DataConnection[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [users, setUsers] = useState<AppUser[]>([])

  useEffect(() => {
    api.get<DataConnection[]>('/connections/').then(setConnections)
    api.get<Role[]>('/roles/').then(setRoles)
    api.get<AppUser[]>('/users/').then(setUsers)
  }, [tab]) // refetch reference lists whenever a tab switch may have changed them

  const roleOptions = useMemo(() => roles.map((r) => ({ value: String(r.id), label: r.name })), [roles])
  const roleNameById = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2.5 border-b border-border px-[18px] py-2.5">
        {/* Same heading style as HomePage's "Favorites" content-panel header -- plain text, no icon. */}
        <div className="text-[1.1em] font-bold">Manager</div>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabName)} className="flex-none gap-0 border-b border-border px-[18px] pt-1.5">
        <TabsList variant="line">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="min-h-0 flex-1 overflow-auto p-[18px]">
        {tab === 'dashboards' && <DashboardsPanel />}
        {tab === 'connections' && <ConnectionsPanel roles={roles} />}
        {tab === 'datastores' && <DatastoresPanel connections={connections} roles={roles} />}
        {tab === 'backup' && <BackupPanel />}
        {tab === 'api-keys' && <ApiKeysPanel users={users} />}
        {tab === 'settings' && (
          <CrudTable
            title="Settings"
            resource="/settings/"
            columns={[
              { field: 'profile', headerName: 'Profile', width: 120, cellClassName: PRIMARY_CELL_CLASS, filter: 'selector' },
              { field: 'key', headerName: 'Key', width: 200, filter: 'text' },
              { field: 'value', headerName: 'Value', flex: 1, filter: 'text' },
            ]}
            fields={SETTING_FIELDS}
          />
        )}
        {tab === 'users' && (
          <CrudTable
            title="Users"
            resource="/users/"
            columns={[
              { field: 'username', headerName: 'Username', width: 140, cellClassName: PRIMARY_CELL_CLASS, filter: 'text' },
              {
                field: 'last_name',
                headerName: 'Name',
                width: 200,
                valueGetter: (_value, row) => formatLastFirst(row.last_name as string, row.first_name as string),
                filter: 'text',
              },
              { field: 'email', headerName: 'Email', width: 200, filter: 'text' },
              { field: 'is_active', headerName: 'Active', width: 80, type: 'boolean', filter: 'selector' },
              {
                field: 'roles',
                headerName: 'Roles',
                flex: 1,
                valueGetter: (value) => ((value as number[] | undefined) ?? []).map((id) => roleNameById.get(id) ?? id).join(', '),
                filter: 'text',
              },
            ]}
            fields={userFields(roleOptions)}
            dialogClassName="sm:max-w-xl"
          />
        )}
        {tab === 'roles' && (
          <CrudTable
            title="Roles"
            resource="/roles/"
            columns={[
              { field: 'name', headerName: 'Name', width: 160, cellClassName: PRIMARY_CELL_CLASS, filter: 'text' },
              { field: 'description', headerName: 'Description', flex: 1, filter: 'text' },
            ]}
            fields={ROLE_FIELDS}
          />
        )}
      </div>
      <StatusBar>{appName} Manager</StatusBar>
    </div>
  )
}

const SETTING_FIELDS: FormField[] = [
  { key: 'profile', label: 'Profile', type: 'text', help: '"*" for the global default' },
  { key: 'key', label: 'Key', type: 'text' },
  { key: 'value', label: 'Value', type: 'text' },
]

function userFields(roleOptions: { value: string; label: string }[]): FormField[] {
  return [
    { key: 'username', label: 'Username', type: 'text', half: true },
    { key: 'email', label: 'Email', type: 'text', half: true },
    { key: 'first_name', label: 'First name', type: 'text', half: true },
    { key: 'last_name', label: 'Last name', type: 'text', half: true },
    { key: 'is_active', label: 'Active', type: 'checkbox' },
    {
      key: 'roles',
      label: 'Roles',
      type: 'multiselect',
      options: roleOptions,
      help: 'The ADMIN role grants full Manager access (equivalent to Superuser).',
      collapsible: true,
    },
    {
      key: 'password',
      label: 'Password',
      type: 'password',
      help: 'Leave blank to keep the current password (new users get no usable password until set here).',
    },
  ]
}

const ROLE_FIELDS: FormField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
]
