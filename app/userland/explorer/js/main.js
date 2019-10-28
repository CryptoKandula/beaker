import { LitElement, html } from 'beaker://app-stdlib/vendor/lit-element/lit-element.js'
import { joinPath, pluralize } from 'beaker://app-stdlib/js/strings.js'
import { findParent } from 'beaker://app-stdlib/js/dom.js'
import * as toast from 'beaker://app-stdlib/js/com/toast.js'
import mainCSS from '../css/main.css.js'
import './view/file.js'
import './view/folder.js'
import './com/drive-info.js'
import './com/mount-info.js'
import './com/location-info.js'
import './com/selection-info.js'

const ICONS = {
  rootRoot: {
    '.data': 'fas fa-database',
    '.settings': 'fas fa-cog',
    '.trash': 'far fa-trash-alt',
    library: 'fas fa-book',
    users: 'fas fa-user'
  },
  rootLibrary: {
    applications: 'fas fa-drafting-compass',
    bookmarks: 'fas fa-star',
    files: 'fas fa-copy',
    media: 'fas fa-photo-video',
    modules: 'fas fa-code',
    websites: 'fas fa-sitemap'
  },
  personRoot: {
    '.data': 'fas fa-database',
    feed: 'fas fa-list',
    friends: 'fas fa-user-friends'
  },
  data: {
    annotations: 'fas fa-tag',
    comments: 'fas fa-comment'
  }
}

export class ExplorerApp extends LitElement {
  static get propertes () {
    return {
      selection: {type: Array},
      renderMode: {type: String}
    }
  }

  static get styles () {
    return mainCSS
  }

  constructor () {
    super()
    this.user = undefined
    this.driveInfo = undefined
    this.pathInfo = undefined
    this.mountInfo = undefined
    this.isNotFound = false
    this.items = []
    this.selection = []
    this.renderMode = undefined
    this.driveTitle = undefined
    this.mountTitle = undefined
    this.showHidden = localStorage.showHidden == 1
    this.load()
  }

  getRealPathname (pathname) {
    var slicePoint = this.mountInfo ? (this.mountInfo.mountPath.length + 1) : 0
    return pathname.slice(slicePoint) || '/'
  }

  getRealUrl (pathname) {
    return joinPath(this.currentDriveInfo.url, this.getRealPathname(pathname))
  }

  get filename () {
    return location.pathname.split('/').pop()
  }

  get realUrl () {
    return this.getRealUrl(location.pathname)
  }

  get realPathname () {
    return this.getRealPathname(location.pathname)
  }

  get currentDriveInfo () {
    return this.mountInfo || this.driveInfo
  }

  get currentDriveTitle () {
    return this.mountTitle || this.driveTitle
  }

  async load () {
    if (!this.user) {
      this.user = await navigator.session.get()
    }

    var drive = new DatArchive(location)
    this.driveInfo = await drive.getInfo()
    this.driveInfo.ident = await navigator.filesystem.identifyDrive(drive.url)
    try {
      this.pathInfo = await drive.stat(location.pathname)
      await this.readMountInfo()
      if (this.pathInfo.isDirectory()) {
        this.items = await drive.readdir(location.pathname, {stat: true})
        this.items.sort((a, b) => a.name.localeCompare(b.name))
        let driveKind = ''
        if (this.currentDriveInfo.ident.isRoot) driveKind = 'root'
        if (this.currentDriveInfo.type === 'unwalled.garden/person') driveKind = 'person'
        this.items.forEach(item => {
          if (item.stat.mount) {
            item.subicon = 'fas fa-external-link-square-alt'
          } else if (driveKind === 'root' && this.realPathname === '/') {
            item.subicon = ICONS.rootRoot[item.name]
          } else if (driveKind === 'root' && this.realPathname === '/library') {
            item.subicon = ICONS.rootLibrary[item.name]
          } else if (driveKind === 'person' && this.realPathname === '/') {
            item.subicon = ICONS.personRoot[item.name]
          } else if ((driveKind === 'root' || driveKind === 'person') && this.realPathname === '/.data') {
            item.subicon = ICONS.data[item.name]
          }
        })
      }
    } catch (e) {
      console.log(e)
      this.isNotFound = true
    }

    if (this.pathInfo.isDirectory()) {
      if (this.currentDriveInfo.type === 'unwalled.garden/person' && this.realPathname === '/feed') {
        this.renderMode = 'feed'
      }
      if (!this.watchStream) {
        let currentDrive = new DatArchive(this.currentDriveInfo.url)
        this.watchStream = currentDrive.watch(this.realPathname)
        this.watchStream.addEventListener('changed', e => {
          this.load()
        })
      }
    } else if (/[?&]edit/.test(location.search)) {
      this.renderMode = 'editor'
    }

    this.driveTitle = getDriveTitle(this.driveInfo)
    this.mountTitle = this.mountInfo ? getDriveTitle(this.mountInfo) : undefined
    document.title = this.filename ? `${this.currentDriveTitle} / ${this.filename}` : this.currentDriveTitle

    console.log({
      driveInfo: this.driveInfo,
      mountInfo: this.mountInfo,
      pathInfo: this.pathInfo
    })

    this.requestUpdate()
  }

  async readMountInfo () {
    var archive = new DatArchive(location)
    var pathParts = location.pathname.split('/').filter(Boolean)
    while (pathParts.length > 0) {
      let st = await archive.stat(pathParts.join('/'))
      if (st.mount) {
        let mount = new DatArchive(st.mount.key)
        this.mountInfo = await mount.getInfo()
        this.mountInfo.mountPath = pathParts.join('/')
        this.mountInfo.ident = await navigator.filesystem.identifyDrive(mount.url)
        return
      }
      pathParts.pop()
    }
  }

  // rendering
  // =

  render () {
    if (!this.driveInfo) return html``

    var selectionIsFolder = this.selection[0] ? this.selection[0].stat.isDirectory() : this.pathInfo.isDirectory()
    var selectionUrl = this.getRealUrl(this.selection[0] ? joinPath(this.realPathname, this.selection[0].name) : this.realPathname)
    var selectionName = selectionUrl.split('/').pop() || (this.realPathname === '/' ? 'drive' : selectionIsFolder ? 'folder' : 'file')
    if (this.selection[0] && this.selection[0].stat.mount) selectionUrl = `dat://${this.selection[0].stat.mount.key}`
    var downloadUrl = `${selectionUrl}${selectionIsFolder ? '?download_as=zip' : ''}`
    return html`
      <link rel="stylesheet" href="beaker://assets/font-awesome.css">
      <div
        class="layout render-mode-${this.renderMode}"
        @click=${this.onClickLayout}
        @goto=${this.onGoto}
        @new-folder=${this.onNewFolder}
        @new-file=${this.onNewFile}
        @import=${this.onImport}
        @save=${this.onSave}
        @rename=${this.onRename}
        @delete=${this.onDelete}
      >
        ${this.pathInfo ? html`
          <nav class="left">
            <drive-info .driveInfo=${this.driveInfo}></drive-info>
            ${this.mountInfo ? html`
              <mount-info .mountInfo=${this.mountInfo}></mount-info>
            ` : ''}
          </nav>
          <main>
            ${this.pathInfo.isDirectory() ? html`
              <explorer-view-folder
                user-url=${this.user.url}
                real-url=${this.realUrl}
                real-pathname=${this.realPathname}
                current-drive-title=${this.currentDriveTitle}
                render-mode=${this.renderMode}
                ?show-hidden=${this.showHidden}
                .currentDriveInfo=${this.currentDriveInfo}
                .items=${this.items}
                .selection=${this.selection}
                @change-selection=${this.onChangeSelection}
              ></explorer-view-folder>
            ` : html`
              <explorer-view-file
                user-url=${this.user.url}
                real-url=${this.realUrl}
                real-pathname=${this.realPathname}
                current-drive-title=${this.currentDriveTitle}
                render-mode=${this.renderMode}
                .currentDriveInfo=${this.currentDriveInfo}
                .pathInfo=${this.pathInfo}
              ></explorer-view-file>
            `}
          </main>
          <nav class="right">
            ${this.selection.length > 0 ? html`
              <selection-info
                user-url=${this.user.url}
                .driveInfo=${this.driveInfo}
                .pathInfo=${this.pathInfo}
                .mountInfo=${this.mountInfo}
                .selection=${this.selection}
                ?no-preview=${this.renderMode === 'feed'}
              ></selection-info>
            ` : html`
              <location-info
                real-pathname=${this.realPathname}
                real-url=${this.realUrl}
                render-mode=${this.renderMode}
                .driveInfo=${this.driveInfo}
                .pathInfo=${this.pathInfo}
                .mountInfo=${this.mountInfo}
                @change-render-mode=${this.onChangeRenderMode}
              ></location-info>
            `}
            ${this.selection.length <= 1 ? html`
              <section class="transparent">
                <p><a href=${selectionUrl} target="_blank"><span class="fa-fw fas fa-external-link-alt"></span> Open ${this.selection.length ? 'selected' : ''} in new tab</a></p>
                <p><a href=${downloadUrl} download=${selectionName}><span class="fa-fw fas fa-file-export"></span> Export ${selectionName}</a></p>
                <p><a href="#" @click=${this.onToggleShowHidden}><span class="fa-fw fas fa-eye"></span> ${this.showHidden ? 'Hide' : 'Show'} hidden files</a></p>
              </section>
            ` : ''}
          ` : undefined}
          </nav>
        ${this.isNotFound ? html`
          <div style="margin: 0 20px">
            <h1>404</h1>
            <h2>File Not found</h2>
          </div>
        ` : undefined}
      </div>
      <input type="file" id="files-picker" multiple @change=${this.onChangeImportFiles} />
    `
  }

  // events
  // =

  onClickLayout (e) {
    if (findParent(e.target, el => el.tagName === 'NAV')) {
      return
    }
    this.selection = []
    this.requestUpdate()
  }

  onGoto (e) {
    var {item} = e.detail
    if (item.stat.mount) {
      window.location = `dat://${item.stat.mount.key}`
    } else {
      window.location = joinPath(window.location.toString(), item.name)
    }
  }

  onToggleShowHidden (e) {
    e.preventDefault()
    this.showHidden = !this.showHidden
    localStorage.showHidden = this.showHidden ? '1' : '0'
    this.requestUpdate()
  }

  onChangeSelection (e) {
    this.selection = e.detail.selection
    this.requestUpdate()
  }

  onChangeRenderMode (e) {
    this.renderMode = e.detail.renderMode
    this.requestUpdate()
  }

  async onNewFile (e) {
    if (!this.currentDriveInfo.writable) return
    var filename = prompt('Enter the name of your new file')
    if (filename) {
      var pathname = joinPath(this.realPathname, filename)
      var drive = new DatArchive(this.currentDriveInfo.url)
      if (await drive.stat(pathname).catch(e => false)) {
        toast.create('A file or folder already exists at that name')
        return
      }
      try {
        await drive.writeFile(pathname, '')
      } catch (e) {
        console.error(e)
        toast.create(`Error: ${e.toString()}`, 'error')
        return
      }
      window.location = window.location.origin + pathname + '?edit'
    }
  }

  async onNewFolder (e) {
    if (!this.currentDriveInfo.writable) return
    var foldername = prompt('Enter the name of your new folder')
    if (foldername) {
      var pathname = joinPath(this.realPathname, foldername)
      var drive = new DatArchive(this.currentDriveInfo.url)
      try {
        await drive.mkdir(pathname)
      } catch (e) {
        console.error(e)
        toast.create(`Error: ${e.toString()}`, 'error')
      }
    }
  }

  onImport (e) {
    if (!this.currentDriveInfo.writable) return
    this.shadowRoot.querySelector('#files-picker').click()
  }

  async onChangeImportFiles (e) {
    var files = e.target.files
    toast.create(`Importing ${files.length} files...`)
    var drive = new DatArchive(this.currentDriveInfo.url)
    try {
      for (let i = 0, file; (file = files[i]); i++) {
        let reader = new FileReader()
        let p = new Promise((resolve, reject) => {
          reader.onload = e => resolve(e.target.result)
          reader.onerror = reject
        })
        reader.readAsArrayBuffer(file)

        var buf = await p
        let pathname = joinPath(this.realPathname, file.name)
        console.log(pathname, buf)
        await drive.writeFile(pathname, buf)
      }
      toast.create(`Imported ${files.length} files`, 'success')
    } catch (e) {
      toast.create(`Import failed: ${e.toString()}`, 'error')
    }
  }

  async onSave (e) {
    if (!this.currentDriveInfo.writable) return
    var value = this.shadowRoot.querySelector('explorer-view-file').editor.getValue()
    var drive = new DatArchive(this.currentDriveInfo.url)
    try {
      await drive.writeFile(this.realPathname, value, 'utf8')
    } catch (e) {
      console.error(e)
      toast.create(`Save failed: ${e.toString()}`, 'error')
      return
    }
    toast.create('Saved', 'success')
  }

  async onRename (e) {
    if (!this.currentDriveInfo.writable) return
    var oldName = this.selection[0] ? this.selection[0].name : this.filename
    var newName = prompt('Enter the new name for this file or folder', oldName)
    if (newName) {
      var oldPath = this.selection[0] ? joinPath(this.realPathname, oldName) : this.realPathname
      var newPath = oldPath.split('/').slice(0, -1).concat([newName]).join('/')
      var drive = new DatArchive(this.currentDriveInfo.url)
      try {
        await drive.rename(oldPath, newPath)
      } catch (e) {
        console.error(e)
        toast.create(`Rename failed: ${e.toString()}`, 'error')
        return
      }
      if (!this.selection[0]) {
        // redirect to new location
        location.pathname = location.pathname.split('/').slice(0, -1).concat([newName]).join('/')
      }
    }
  }

  async onDelete (e) {
    if (!this.currentDriveInfo.writable) return

    var drive = new DatArchive(this.currentDriveInfo.url)
    const del = async (pathname, stat) => {
      if (stat.isDirectory()) {
        await drive.rmdir(pathname, {recursive: true})
      } else {
        await drive.unlink(pathname)
      }
    }

    try {
      if (this.selection.length) {
        if (!confirm(`Delete ${this.selection.length} ${pluralize(this.selection.length, 'item')}?`)) {
          return
        }

        toast.create(`Deleting ${pluralize(this.selection.length, 'item')}...`)
        for (let sel of this.selection) {
          await del(joinPath(this.realPathname, sel.name), sel.stat)
        }
        toast.create(`Deleted ${pluralize(this.selection.length, 'item')}`, 'success')
      } else {
        if (!confirm(`Are you sure you want to delete this ${this.pathInfo.isDirectory() ? 'folder' : 'file'}?`)) {
          return
        }

        toast.create(`Deleting 1 item...`)
        await del(this.realPathname, this.pathInfo)
        toast.create(`Deleted 1 item`, 'success')

        location.pathname = location.pathname.split('/').slice(0, -1).join('/')
      }
    } catch (e) {
      console.error(e)
      toast.create(`Deletion failed: ${e.toString()}`, 'error')
    }
  }
}

customElements.define('explorer-app', ExplorerApp)

function getDriveTitle (info) {
  if (info.title) return info.title
  else if (info.ident.isRoot) return 'My Hyperdrive'
  else return 'Untitled'
}