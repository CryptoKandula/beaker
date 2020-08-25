import { LitElement, html } from '../../vendor/lit-element/lit-element.js'
import { repeat } from '../../vendor/lit-element/lit-html/directives/repeat.js'
import css from '../../css/com/record-feed.css.js'
import { emit } from '../dom.js'

import './record.js'

const DEFAULT_SEARCH_INDEXES = [
  'beaker/index/blogposts',
  'beaker/index/bookmarks',
  'beaker/index/microblogposts',
  'beaker/index/pages'
]

export class RecordFeed extends LitElement {
  static get properties () {
    return {
      index: {type: Array},
      title: {type: String},
      showDateTitles: {type: Boolean, attribute: 'show-date-titles'},
      dateTitleRange: {type: String, attribute: 'date-title-range'},
      sort: {type: String},
      limit: {type: Number},
      filter: {type: String},
      sources: {type: Array},
      results: {type: Array},
      hideEmpty: {type: Boolean, attribute: 'hide-empty'},
      noMerge: {type: Boolean, attribute: 'no-merge'},
      profileUrl: {type: String, attribute: 'profile-url'}
    }
  }

  static get styles () {
    return css
  }

  constructor () {
    super()
    this.index = undefined
    this.title = ''
    this.showDateTitles = false
    this.dateTitleRange = undefined
    this.sort = 'ctime'
    this.limit = undefined
    this.filter = undefined
    this.sources = undefined
    this.results = undefined
    this.hideEmpty = false
    this.noMerge = false
    this.profileUrl = ''

    // query state
    this.activeQuery = undefined
    this.abortController = undefined
  }

  get isLoading () {
    return !this.results || !!this.activeQuery
  }

  async load () {
    this.queueQuery()
  }

  updated (changedProperties) {
    if (typeof this.results === 'undefined') {
      if (!this.activeQuery) {
        this.queueQuery()
      }
      return
    } else if (changedProperties.has('filter') && changedProperties.get('filter') != this.filter) {
      this.queueQuery()
    } else if (changedProperties.has('index') && !isArrayEq(this.index, changedProperties.get('index'))) {
      this.results = undefined // clear results while loading
      this.queueQuery()
    } else if (changedProperties.has('sources') && !isArrayEq(this.sources, changedProperties.get('sources'))) {
      this.queueQuery()
    }
  }

  queueQuery () {
    if (!this.activeQuery) {
      this.activeQuery = this.query()
      this.requestUpdate()
    } else {
      if (this.abortController) this.abortController.abort()
      this.activeQuery = this.activeQuery.catch(e => undefined).then(r => {
        this.activeQuery = undefined
        this.queueQuery()
      })
    }
  }

  async query () {
    emit(this, 'load-state-updated')
    this.abortController = new AbortController()
    var results = []
    if (this.index?.[0] === 'notifications') {
      results = await beaker.database.listNotifications({
        filter: {search: this.filter},
        limit: this.limit,
        sort: 'rtime',
        reverse: true
      })
    } else if (this.filter) {
      results = await beaker.database.searchRecords(this.filter, {
        filter: {index: this.index || DEFAULT_SEARCH_INDEXES, site: this.sources},
        limit: this.limit,
        sort: 'ctime',
        reverse: true
      })
    } else {
      // because we collapse results, we need to run the query until the limit is fulfilled
      let offset = 0
      do {
        let subresults = await beaker.database.listRecords({
          filter: {index: this.index, site: this.sources},
          limit: this.limit,
          offset,
          sort: 'ctime',
          reverse: true
        })
        if (subresults.length === 0) break
        
        offset += subresults.length
        if (!this.noMerge) {
          subresults = subresults.reduce(reduceMultipleActions, [])
        }
        results = results.concat(subresults)
      } while (results.length < this.limit)
    }
    console.log(results)
    this.results = results
    this.activeQuery = undefined
    emit(this, 'load-state-updated')
  }

  // rendering
  // =

  render () {
    if (!this.results) {
      return html``
    }
    if (!this.results.length) {
      if (this.hideEmpty) return html``
      return html`
        <link rel="stylesheet" href="beaker://app-stdlib/css/fontawesome.css">
        ${this.title ? html`<h2 class="results-header"><span>${this.title}</span></h2>` : ''}
        <div class="results empty">
          ${this.filter ? html`
            <span>No matches found for "${this.filter}".</div></span>
          ` : html`
            <span>Click "${this.createLabel}" to get started</div></span>
          `}
        </div>
      `
    }
    return html`
      <link rel="stylesheet" href="beaker://app-stdlib/css/fontawesome.css">
      ${this.title ? html`<h2 class="results-header"><span>${this.title}</span></h2>` : ''}
      ${this.renderResults()}
    `
  }

  renderResults () {
    this.lastResultNiceDate = undefined // used by renderDateTitle
    if (!this.filter) {
      return html`
        <div class="results">
          ${repeat(this.results, result => result.url, result => html`
            ${this.renderDateTitle(result)}
            ${this.renderNormalResult(result)}
          `)}
        </div>
      `
    }
    return html`
      <div class="results">
        ${repeat(this.results, result => result.url, result => this.renderSearchResult(result))}
      </div>
    `
  }

  renderDateTitle (result) {
    if (!this.showDateTitles) return ''
    var resultNiceDate = dateHeader(result.ctime, this.dateTitleRange)
    if (this.lastResultNiceDate === resultNiceDate) return ''
    this.lastResultNiceDate = resultNiceDate
    return html`
      <h2 class="results-header"><span>${resultNiceDate}</span></h2>
    `
  }
  
  renderNormalResult (result) {
    var renderMode = ({
      'beaker/index/comments': 'comment',
      'beaker/index/microblogposts': 'card',
      'beaker/index/subscriptions': 'action',
    })[result.index] || 'link'
    return html`
      <beaker-record
        .record=${result}
        render-mode=${renderMode}
        show-context
        profile-url=${this.profileUrl}
      ></beaker-record>
    `
  }

  renderSearchResult (result) {
    return html`
      <beaker-record
        .record=${result}
        render-mode="expanded-link"
        profile-url=${this.profileUrl}
      ></beaker-record>
    `
  }

  // events
  // =
}

customElements.define('beaker-record-feed', RecordFeed)

function isArrayEq (a, b) {
  if (!a && !!b) return false
  if (!!a && !b) return false
  return a.sort().toString() == b.sort().toString() 
}

const HOUR = 1e3 * 60 * 60
const DAY = HOUR * 24
function dateHeader (ts, range) {
  const endOfTodayMs = +((new Date).setHours(23,59,59,999))
  var diff = endOfTodayMs - ts
  if (diff < DAY) return 'Today'
  if (diff < DAY * 6) return (new Date(ts)).toLocaleDateString('default', { weekday: 'long' })
  if (range === 'month') return (new Date(ts)).toLocaleDateString('default', { month: 'short', year: 'numeric' })
  return (new Date(ts)).toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })
}

function reduceMultipleActions (acc, result) {
  let last = acc[acc.length - 1]
  if (last) {
    if (last.site.url === result.site.url && result.index === 'beaker/index/subscriptions') {
      last.mergedItems = last.mergedItems || []
      last.mergedItems.push(result)
      return acc
    }
  }
  acc.push(result)
  return acc
}