require('shelljs/global')
require('shelljs').config.silent = true
const requestSync = require(`sync-request`)
const request = require(`request`)
const async = require(`async`)
const fs = require(`fs`)
const path = require(`path`)
const md5Dir = require(`md5-dir`)
const log = require('single-line-log').stdout

const download = require(`./download-file`)
const commonWeightNameMap = require(`./common-weight-name-map`)

const baseurl = `https://google-webfonts-helper.herokuapp.com/api/fonts/`
const id = process.argv[2]
if (!id) {
  console.warn(`You need to pass in the google font id as an argument`)
  process.exit()
}

const res = requestSync(`GET`, baseurl + id)
const typeface = JSON.parse(res.getBody(`UTF-8`))

const typefaceDir = `packages/${typeface.id}`

// Create the directories for this typeface.
mkdir(typefaceDir)
mkdir(typefaceDir + `/files`)

// Make git ignore typeface files so we're not checking in GBs of data.
fs.writeFileSync(typefaceDir + `/.gitignore`, '/files')
fs.writeFileSync(typefaceDir + `/.npmignore`, '')
fs.writeFileSync(typefaceDir + `/files/.gitignore`, '')

const makeFontFilePath = (item, extension) => {
  let style = ""
  if (item.fontStyle !== `normal`) {
    style = item.fontStyle
  }
  return `./files/${typeface.id}-${typeface.defSubset}-${item.fontWeight}${style}.${extension}`
}

// Download all font files.
async.map(typeface.variants, (item, callback) => {
  // Download eot, svg, woff, and woff2 in parallal.
  const downloads = [`eot`, `svg`, `woff`, `woff2`].map((extension) => {
    const dest = path.join(typefaceDir, makeFontFilePath(item, extension))
    const url = item[extension]
    return {
      url,
      dest,
    }
  })
  async.map(downloads, (d, cb) => {
    const { url, dest } = d
    download(url, dest, (err) => {
      log(`Finished downloading "${url}" to "${dest}"`)
      cb(err)
    })
  }, callback)
}, (err, results) => {
  // Create md5 hash of directory and write this out so git/lerna knows if anything
  // has changed.
  md5Dir(`${typefaceDir}/files`, (err, filesHash) => {
    // If a hash file already exists, check if anything has changed. If it has
    // then update the hash, otherwise exit.
    if (fs.existsSync(`${typefaceDir}/files-hash.json`)) {
      const filesHashJson = JSON.parse(fs.readFileSync(`${typefaceDir}/files-hash.json`, `utf-8`))
      if (filesHashJson.hash === filesHash) {
        // Exit
        console.log(`The md5 hash of the new font files haven't changed (meaning no font files have changed) so exiting`)
        process.exit()
      } else {
      }
    }

    // Either the files hash file needs updated or written new.
    fs.writeFileSync(`${typefaceDir}/files-hash.json`, JSON.stringify({
      hash: filesHash,
      updatedAt: new Date().toJSON(),
    }))

    // Write out package.json file
    const packageJSON = `
{
  "name": "typeface-${typeface.id}",
  "version": "0.0.2",
  "description": "${typeface.family} typeface",
  "main": "index.css",
  "keywords": [
    "typeface",
    "${typeface.id}"
  ],
  "author": "Kyle Mathews <mathews.kyle@gmail.com>",
  "license": "MIT"
}`
    fs.writeFileSync(`${typefaceDir}/package.json`, packageJSON)

    // Write out index.css file
    css = typeface.variants.map((item) => {
      let style = ""
      if (item.fontStyle !== `normal`) {
        style = item.fontStyle
      }
      return `
/* ${typeface.id}-${item.fontWeight}${item.fontStyle} - latin */
@font-face {
  font-family: '${typeface.family}';
  font-style: ${item.fontStyle};
  font-weight: ${item.fontWeight};
  src: url('${makeFontFilePath(item, 'eot')}'); /* IE9 Compat Modes */
  src: local('${typeface.family} ${commonWeightNameMap(item.fontWeight)} ${style}'), local('${typeface.family}-${commonWeightNameMap(item.fontWeight)}${style}'),
       url('${makeFontFilePath(item, 'eot')}?#iefix') format('embedded-opentype'), /* IE6-IE8 */
       url('${makeFontFilePath(item, 'woff2')}') format('woff2'), /* Super Modern Browsers */
       url('${makeFontFilePath(item, 'woff')}') format('woff'), /* Modern Browsers */
       url('${makeFontFilePath(item, 'svg')}#${typeface.family}') format('svg'); /* Legacy iOS */
}
    `
    })

    fs.writeFileSync(`${typefaceDir}/index.css`, css.join(''))
    console.log(`\nfinished`)
  })
})
