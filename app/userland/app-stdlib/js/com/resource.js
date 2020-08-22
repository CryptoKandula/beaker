import { LitElement, html } from '../../vendor/lit-element/lit-element.js'
import { classMap } from '../../vendor/lit-element/lit-html/directives/class-map.js'
import { unsafeHTML } from '../../vendor/lit-element/lit-html/directives/unsafe-html.js'
import { asyncReplace } from '../../vendor/lit-element/lit-html/directives/async-replace.js'
import { SitesListPopup } from './popups/sites-list.js'
import css from '../../css/com/resource.css.js'
import { removeMarkdown } from '../../vendor/remove-markdown.js'
import { shorten, makeSafe, toNiceDomain, pluralize, joinPath } from '../strings.js'
import { emit } from '../dom.js'
import './post-composer.js'

export class Resource extends LitElement {
  static get properties () {
    return {
      resource: {type: Object},
      renderMode: {type: String, attribute: 'render-mode'},
      showContext: {type: Boolean, attribute: 'show-context'},
      profileUrl: {type: String, attribute: 'profile-url'},
      actionTarget: {type: String, attribute: 'action-target'},
      isReplyOpen: {type: Boolean}
    }
  }

  static get styles () {
    return css
  }

  constructor () {
    super()
    this.resource = undefined
    this.renderMode = 'card'
    this.showContext = false
    this.profileUrl = undefined
    this.actionTarget = undefined
    this.isReplyOpen = false

    // helper state
    this.isMouseDown = false
    this.isMouseDragging = false
  }

  // rendering
  // =

  render () {
    if (!this.resource) return html``
    switch (this.renderMode) {
      case 'card': return this.renderAsCard()
      case 'comment': return this.renderAsComment()
      case 'action': return this.renderAsAction()
      case 'expanded-link': return this.renderAsExpandedLink()
      case 'link':
      default:
        return this.renderResultAsLink()
    }
  }

  renderAsCard () {
    const res = this.resource

    var context = undefined
    switch (res.index) {
      case 'beaker/index/comments':
        context = res.metadata['beaker/subject'] || res.metadata['beaker/parent']
        break
    }

    return html`
      <link rel="stylesheet" href="beaker://app-stdlib/css/fontawesome.css">
      ${res.notification ? this.renderNotification() : ''}
      <div
        class=${classMap({
          resource: true,
          card: true,
          'is-notification': !!res.notification,
          unread: !!res.notification && !res?.notification?.isRead
        })}
      >
        <a class="thumb" href=${res.site.url} title=${res.site.title} data-tooltip=${res.site.title}>
          <img class="favicon" src="${joinPath(res.site.url, 'thumb')}">
        </a>
        <span class="arrow"></span>
        <div
          class="container"
          @mousedown=${this.onMousedownCard}
          @mouseup=${this.onMouseupCard}
          @mousemove=${this.onMousemoveCard}
        >
          <div class="header">
            <div class="origin">
              ${res.site.url === 'hyper://private/' ? html`
                <a class="author" href=${res.site.url} title=${res.site.title}>I privately</a>
              ` : html`
                <a class="author" href=${res.site.url} title=${res.site.title}>
                  ${res.site.title}
                </a>
              `}
            </div>
            <span>&middot;</span>
            <div class="date">
              <a href=${res.url} data-tooltip=${(new Date(res.ctime)).toLocaleString()}>
                ${relativeDate(res.ctime)}
              </a>
            </div>
            ${this.showContext && context ? html`
              <span>&middot;</span>
              <div class="context">
                <a href=${context}>
                  ${fancyUrl(context)}
                </a>
              </div>
            ` : ''}
          </div>
          <div class="content markdown">
            ${renderMatchText(res, 'content') || unsafeHTML(beaker.markdown.toHTML(res.content))}
          </div>
          ${''/*TODO <div class="tags">
            <a href="#">beaker</a>
            <a href="#">hyperspace</a>
            <a href="#">p2p</a>
          </div>*/}
        </div>
      </div>
    `
  }

  renderAsComment () {
    const res = this.resource

    var context = undefined
    switch (res.index) {
      case 'beaker/index/comments':
        context = res.metadata['beaker/subject'] || res.metadata['beaker/parent']
        break
    }

    return html`
      <link rel="stylesheet" href="beaker://app-stdlib/css/fontawesome.css">
      ${res.notification ? this.renderNotification() : ''}
      <div
        class=${classMap({
          resource: true,
          comment: true,
          'is-notification': !!res.notification,
          unread: !!res.notification && !res?.notification?.isRead
        })}
        @mousedown=${this.onMousedownCard}
        @mouseup=${this.onMouseupCard}
        @mousemove=${this.onMousemoveCard}
      >
        <div class="header">
          <a class="thumb" href=${res.site.url} title=${res.site.title} data-tooltip=${res.site.title}>
            <img class="favicon" src="${joinPath(res.site.url, 'thumb')}">
          </a>
          <div class="origin">
            ${res.site.url === 'hyper://private/' ? html`
              <a class="author" href=${res.site.url} title=${res.site.title}>I privately</a>
            ` : html`
              <a class="author" href=${res.site.url} title=${res.site.title}>
                ${res.site.title}
              </a>
            `}
          </div>
          <span>&middot;</span>
          <div class="date">
            <a href=${res.url} data-tooltip=${(new Date(res.ctime)).toLocaleString()}>
              ${relativeDate(res.ctime)}
            </a>
          </div>
          ${this.showContext && context ? html`
            <span>&middot;</span>
            <div class="context">
              <a href=${context}>
                ${fancyUrl(context)}
              </a>
            </div>
          ` : ''}
        </div>
        <div class="content markdown">
          ${renderMatchText(res, 'content') || unsafeHTML(beaker.markdown.toHTML(res.content))}
        </div>
        <div class="ctrls">
          <a @click=${this.onClickReply}><span class="fas fa-fw fa-reply"></span> <small>Reply</small></a>
        </div>
        ${this.isReplyOpen ? html`
          <beaker-post-composer
            subject=${this.resource.metadata['beaker/subject'] || this.resource.url}
            parent=${this.resource.url}
            placeholder="Write your comment"
            @publish=${this.onPublishReply}
            @cancel=${this.onCancelReply}
          ></beaker-post-composer>
        ` : ''}
      </div>
    `
  }

  renderAsAction () {
    const res = this.resource

    var subject
    if (res.index === 'beaker/index/subscriptions') {
      subject = res.metadata.href === this.profileUrl ? 'you' : res.metadata.title || res.metadata.href
    } else {
      if (res.metadata.title) subject = res.metadata.title
      else if (res.content) subject = shorten(removeMarkdown(res.content), 40)
      else subject = fancyUrl(res.url)
    }

    return html`
      <div
        class=${classMap({
          resource: true,
          action: true,
          'is-notification': !!res.notification,
          unread: !!res.notification && !res?.notification?.isRead
        })}
      >
        <a class="thumb" href=${res.site.url} title=${res.site.title} data-tooltip=${res.site.title}>
          <img class="favicon" src="${joinPath(res.site.url, 'thumb')}">
        </a>
        <div>
          <a class="author" href=${res.site.url} title=${res.site.title}>
            ${res.site.url === 'hyper://private' ? 'I (privately)' : res.site.title}
          </a>
          ${res.index === 'beaker/index/subscriptions' ? html`
            <span class="action">subscribed to</span>
            <a class="subject" href=${res.metadata.href} title=${subject}>${subject}</a>
          ` : res.index === 'beaker/index/bookmarks' ? html`
            <span class="action">bookmarked ${this.actionTarget}</span>
          ` : html`
            <span class="action">mentioned ${this.actionTarget} in</span>
            <a class="subject" href=${res.url} title=${subject}>${subject}</a>
          `}
          ${res.mergedItems ? html`
            <span>and</span>
            <a
              class="others"
              href="#"
              data-tooltip=${shorten(res.mergedItems.map(r => r.metadata.title || 'Untitled').join(', '), 100)}
              @click=${e => this.onClickShowSites(e, res.mergedItems)}
            >${res.mergedItems.length} other ${pluralize(res.mergedItems.length, 'site')}</a>
          ` : ''}
          <span class="date">${relativeDate(res.ctime)}</span>
        </div>
      </div>
    `
  }

  renderAsExpandedLink () {
    const res = this.resource

    var isBookmark = res.index === 'beaker/index/bookmarks'
    var href = undefined
    switch (res.index) {
      case 'beaker/index/bookmarks': href = res.metadata.href; break
    }
    href = href || res.url
    var title = res.metadata.title || res.url.split('/').pop()
    return html`
      <div class="resource expanded-link">
        <a class="thumb" href=${href} title=${res.site.title}>
          ${this.renderThumb(res)}
        </a>
        <div class="info">
          <div class="title"><a href=${href}>${renderMatchText(res, 'title') || title}</a></div>
          <div class="origin">
            ${isBookmark ? html`
              <span class="origin-note"><span class="far fa-fw fa-star"></span> Bookmarked by</span>
              <a class="author" href=${res.site.url} title=${res.site.title}>
                ${res.site.url === 'hyper://private/' ? 'Me (Private)' : res.site.title}
              </a>
            ` : (
              res.site.url === 'hyper://private/' ? html`
                <span class="sysicon fas fa-fw fa-lock"></span>
                <a class="author" href=${res.site.url} title=${res.site.title}>
                  Me (Private)
                </a>
              ` : html`
                <img class="favicon" src="${joinPath(res.site.url, 'thumb')}">
                <a class="author" href=${res.site.url} title=${res.site.title}>
                  ${res.site.title}
                </a>
              `)
            }
            <span>|</span>
            <a class="date" href=${href}>${niceDate(res.ctime)}</a>
          </div>
          ${res.content ? html`
            <div class="excerpt">
              ${renderMatchText(res, 'content') || shorten(removeMarkdown(removeFirstMdHeader(res.content)), 300)}
            </div>
          ` : ''}
          ${''/*TODO<div class="tags">
            <a href="#">#beaker</a>
            <a href="#">#hyperspace</a>
            <a href="#">#p2p</a>
          </div>*/}
        </div>
      </a>
    `
  }

  renderResultAsLink () {
    const res = this.resource

    var href = undefined
    switch (res.index) {
      case 'beaker/index/comments': href = res.metadata['beaker/subject']; break
      case 'beaker/index/bookmarks': href = res.metadata.href; break
    }
    href = href || res.url

    var hrefp
    if (res.index === 'beaker/index/bookmarks' && href) {
      try {
        hrefp = new URL(href)
      } catch {}
    }

    var title = res.metadata['title'] || ({
      'beaker/index/bookmarks': niceDate(res.ctime),
      'beaker/index/blogposts': niceDate(res.ctime),
      'beaker/index/microblogposts': niceDate(res.ctime),
      'beaker/index/pages': niceDate(res.ctime),
      'beaker/index/comments': niceDate(res.ctime)
    })[res.index] || res.url.split('/').pop() || niceDate(res.ctime)

    return html`
      <link rel="stylesheet" href="beaker://app-stdlib/css/fontawesome.css">
      ${res.notification ? this.renderNotification() : ''}
      <div
        class=${classMap({
          resource: true,
          link: true,
          'is-notification': !!res.notification,
          unread: !!res.notification && !res?.notification?.isRead
        })}
      >
        <a class="thumb" href=${res.site.url} title=${res.site.title} data-tooltip=${res.site.title}>
          <img class="favicon" src="${joinPath(res.site.url, 'thumb')}">
        </a>
        <div class="container">
          <div class="title">
            <a class="link-title" href=${href}>${title}</a>
            ${hrefp ? html`
              <a class="link-origin" href=${hrefp.origin}>${toNiceDomain(hrefp.hostname)}</a>
            ` : ''}
          </div>
          <div class="ctrls">
            ${res.index === 'beaker/index/bookmarks' ? html`<span class="far fa-star"></span>` : ''}
            ${res.index === 'beaker/index/pages' ? html`<span class="far fa-file"></span>` : ''}
            ${res.index === 'beaker/index/blogposts' ? html`<span class="fas fa-blog"></span>` : ''}
            by
            <span class="origin">
              <a class="author" href=${res.site.url} title=${res.site.title}>
                ${res.site.url === 'hyper://private' ? 'Me (Privately)' : res.site.title}
              </a>
            </span>
            <span class="divider">|</span>
            <span class="date">
              <a href=${res.url} data-tooltip=${(new Date(res.ctime)).toLocaleString()}>
                ${relativeDate(res.ctime)}
              </a>
            </span>
            <span class="divider">|</span>
            <a @click=${e => this.onViewThread(e, res)}>
              comments
            </a>
          </div>
        </div>
      </div>
    `
  }

  renderThumb (url = undefined) {
    url = url || this.resource.url
    if (url && /\.(png|jpe?g|gif)$/.test(url)) {
      return html`<img src=${url}>`
    }
    var icon = 'far fa-file-alt'
    switch (this.resource.index) {
      case 'beaker/index/blogposts': icon = 'fas fa-blog'; break
      case 'beaker/index/pages': icon = 'far fa-file-alt'; break
      case 'beaker/index/bookmarks': icon = 'fas fa-star'; break
      case 'beaker/index/microblogposts': icon = 'fas fa-stream'; break
      case 'beaker/index/comments': icon = 'far fa-comment'; break
    }
    return html`
      <span class="icon">
        <span class="fa-fw ${icon}"></span>
      </span>
    `
  }

  renderNotification () {
    const res = this.resource
    var description = ({
      'beaker/notification/bookmark': 'bookmarked',
      'beaker/notification/comment': 'commented on',
      'beaker/notification/mention': 'mentioned',
      'beaker/notification/reply': 'replied to'
    })[res.notification.type] || 'linked to'
    var where = ({
      'beaker/index/pages': 'in',
      'beaker/index/blogpostss': 'in'
    })[res.index] || ''
    return html`
      <div class="notification">
        ${res.site.title}
        ${description}
        <a href=${res.notification.subject}>
          ${asyncReplace(getNotificationSubjectStream(res.notification.subject, this.profileUrl))}
        </a>
        ${where}
      </div>
    `
  }

  // events
  // =

  onClickReply (e) {
    e.preventDefault()
    this.isReplyOpen = true
  }

  onPublishReply (e) {
    e.preventDefault()
    e.stopPropagation()
    this.isReplyOpen = false
    emit(this, 'publish-reply')
  }

  onCancelReply (e) {
    this.isReplyOpen = false
  }

  onViewThread (e, resource) {
    emit(this, 'view-thread', {detail: {resource: this.resource}})
  }

  onMousedownCard (e) {
    for (let el of e.path) {
      if (el.tagName === 'A' || el.tagName === 'BEAKER-POST-COMPOSER') return
    }
    this.isMouseDown = true
    this.isMouseDragging = false
  }

  onMousemoveCard (e) {
    if (this.isMouseDown) {
      this.isMouseDragging = true
    }
  }

  onMouseupCard (e) {
    if (!this.isMouseDown) return
    if (!this.isMouseDragging) {
      emit(this, 'view-thread', {detail: {resource: this.resource}})
    }
    this.isMouseDown = false
    this.isMouseDragging = false
  }

  onClickShowSites (e, results) {
    e.preventDefault()
    SitesListPopup.create('Subscribed Sites', results.map(r => ({
      url: r.metadata.href,
      title: r.metadata.title || 'Untitled'
    })))
  }
}

customElements.define('beaker-resource', Resource)

function renderMatchText (result, key) {
  if (!result.matches) return undefined
  var match = result.matches.find(m => m.key === key)
  if (!match) return undefined
  return unsafeHTML(makeSafe(removeMarkdown(match.value, {keepHtml: true})).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>'))
}

function removeFirstMdHeader (str = '') {
  return str.replace(/(^#\s.*\r?\n)/, '').trim()
}

var _notificationSubjectCache = {}
async function getNotificationSubject (url) {
  if (_notificationSubjectCache[url]) {
    return _notificationSubjectCache[url]
  }
  try {
    let item = await beaker.indexer.get(url)
    if (item.metadata.title) {
      return `"${item.metadata.title}"`
    }
    switch (item.index) {
      case 'beaker/index/comments': return 'your comment'
      case 'beaker/index/pages': return 'your page'
      case 'beaker/index/blogposts': return 'your blog post'
      case 'beaker/index/microblogposts': return 'your post'
    }
  } catch {}
  return 'your page'
}

async function* getNotificationSubjectStream (url, profileUrl) {
  if (isRootUrl(url)) {
    if (url === profileUrl) {
      yield 'you'
    } else {
      yield 'your site'
    }
  } else {
    yield await getNotificationSubject(url)
  }
}

function isRootUrl (url) {
  try {
    return (new URL(url)).pathname === '/'
  } catch {
    return false
  }
}

function fancyUrl (str) {
  try {
    let url = new URL(str)
    let parts = [toNiceDomain(url.hostname)].concat(url.pathname.split('/').filter(Boolean))
    return parts.join(' › ')
  } catch (e) {
    return str
  }
}

const today = (new Date()).toLocaleDateString('default', { year: 'numeric', month: 'short', day: 'numeric' })
const yesterday = (new Date(Date.now() - 8.64e7)).toLocaleDateString('default', { year: 'numeric', month: 'short', day: 'numeric' })
function niceDate (ts, {largeIntervals} = {largeIntervals: false}) {
  var date = (new Date(ts)).toLocaleDateString('default', { year: 'numeric', month: 'short', day: 'numeric' })
  if (date === today) return 'Today'
  if (date === yesterday) return 'Yesterday'
  if (largeIntervals) {
    return (new Date(ts)).toLocaleDateString('default', { year: 'numeric', month: 'long' })
  }
  return date
}

const MINUTE = 1e3 * 60
const HOUR = 1e3 * 60 * 60
const DAY = HOUR * 24

const rtf = new Intl.RelativeTimeFormat('en', {numeric: 'auto'})
function relativeDate (d) {
  const nowMs = Date.now()
  const endOfTodayMs = +((new Date).setHours(23,59,59,999))
  var diff = nowMs - d
  var dayDiff = Math.floor((endOfTodayMs - d) / DAY)
  if (diff < HOUR) return rtf.format(Math.ceil(diff / MINUTE * -1), 'minute')
  if (dayDiff < 1) return rtf.format(Math.ceil(diff / HOUR * -1), 'hour')
  if (dayDiff <= 30) return rtf.format(dayDiff * -1, 'day')
  if (dayDiff <= 365) return rtf.format(Math.floor(dayDiff / 30) * -1, 'month')
  return rtf.format(Math.floor(dayDiff / 365) * -1, 'year')
}
