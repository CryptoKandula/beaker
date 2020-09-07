import * as db from './profile-data-db'
import knex from '../lib/knex'
import lock from '../../lib/lock'
import { normalizeOrigin } from '../../lib/urls'

// typedefs
// =

/**
 * @typedef {Object} UserSiteSession
 * @prop {number} id
 * @prop {string} siteOrigin
 * @prop {string} userUrl
 * @prop {Object} permissions
 * @prop {Date} createdAt
 */

// globals
// =

var sessions = {} // cache of active sessions

// exported api
// =

export function setup () {
}

/**
 * @param {string} siteOrigin
 * @param {string} userUrl
 * @param {Object} permissions
 * @returns {Promise<UserSiteSession>}
 */
export async function create (siteOrigin, userUrl, permissions) {
  siteOrigin = normalizeOrigin(siteOrigin)
  var release = await lock('user-site-sessions')
  try {
    delete sessions[siteOrigin]
    await db.run(knex('user_site_sessions').where({siteOrigin}).delete())
    await db.run(knex('user_site_sessions').insert({
      siteOrigin,
      userUrl,
      permissionsJson: JSON.stringify(permissions || {}),
      createdAt: Date.now()
    }))
  } finally {
    release()
  }
  return get(siteOrigin)
}

/**
 * @param {string} siteOrigin
 * @returns {Promise<UserSiteSession>}
 */
export async function get (siteOrigin) {
  siteOrigin = normalizeOrigin(siteOrigin)
  var sess = sessions[siteOrigin]
  if (sess) return sess
  var record = massageRecord(await db.get(knex('user_site_sessions').where({siteOrigin})))
  if (record) {
    sessions[siteOrigin] = record
  }
  return record
}

/**
 * @returns {Promise<UserSiteSession[]>}
 */
export async function list () {
  var records = await db.all(knex('user_site_sessions'))
  return records.map(massageRecord)
}

/**
 * @param {string} siteOrigin
 * @returns {Promise<void>}
 */
export async function destroy (siteOrigin) {
  siteOrigin = normalizeOrigin(siteOrigin)
  var release = await lock('user-site-sessions')
  try {
    delete sessions[siteOrigin]
    await db.run(knex('user_site_sessions').where({siteOrigin}).delete())
  } finally {
    release()
  }
}

// internal methods
// =

/**
 * @param {Object} record
 * @returns {UserSiteSession}
 */
function massageRecord (record) {
  if (!record) return null
  var permissions
  try { permissions = JSON.parse(record.permissionsJson) }
  catch (e) { permissions = {} }
  return {
    id: record.id,
    siteOrigin: record.siteOrigin,
    userUrl: record.userUrl,
    permissions,
    createdAt: new Date(record.createdAt)
  }
}