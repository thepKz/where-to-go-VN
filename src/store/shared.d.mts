import type { Tables, Change, Table, Identity } from './types'
export const tableNames: Table[]
export function emptyTables(): Tables
export function rowKey(table: Table, row: any): string
export function applyChange(tables: Tables, change: {table: Table; row: any}): Tables
export function remapChange(change: Change, from: Identity, to: Identity): Change
