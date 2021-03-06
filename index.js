const fs = require('fs');
const os = require('os')
const cp = require('child_process');
const path = require('path');
const fetch = require('node-fetch');
const {JSDOM} = require('jsdom');
const imgur = require('imgur');

const E = process.env;
const stdio = [0, 1, 2];
const CSV_COLUMNS = [
  'Center', 'Title', 'Faculty Name', 'Research Area', 'Type of Work',
  'Current State of Work', 'Potential Applications', 'Keywords'
];




function delay(ms) {
  return new Promise(fres => setTimeout(fres, ms));
}


function readFile(pth) {
  var d = fs.readFileSync(pth, 'utf8');
  return d.replace(/\r?\n/g, '\n');
}

function writeFile(pth, d, o={}) {
  if (fs.existsSync(pth) && !o.overwrite) return;
  d = d.replace(/\r?\n/g, os.EOL);
  fs.writeFileSync(pth, d);
}

function cpExec(cmd, o) {
  var o = Object.assign({stdio}, o);
  console.info(`$ ${cmd}`);
  try { cp.execSync(cmd.replace(/^\./, ''), o); }
  catch (e) { console.error(e.message); }
}


async function fetchBody(url) {
  var res = await fetch(url);
  var txt = await res.text();
  txt = txt.replace(`<link rel="stylesheet" type="text/css" href="/tto/static/style.css">`, ``);
  txt = txt.replace(`<link rel="stylesheet" type="text/css" href="/tto/static/style.scss">`, ``);
  var dom = new JSDOM(txt, {url, resources: 'usable', runScripts: 'dangerously'});
  var {window} = dom, {document} = window, {body} = document;
  await delay(1000);
  return body;
}

function readDetails(body) {
  var div1 = body.querySelector('#div1');
  var videoUrl = div1.querySelector('video').getAttribute('src').trim();
  var posterUrl = div1.querySelector('a').getAttribute('href').trim();
  var posterImgUrl = div1.querySelector('img').getAttribute('src');
  var title = div1.querySelector('h3').textContent.replace(/[^\w\s,-]/g, ' - ').replace(/\s+/g, ' ').trim();
  var headings = [...div1.querySelectorAll('h4 b')].map(e => e.textContent.trim());
  var texts = [...div1.querySelectorAll('h5')].map(e => e.textContent.trim());
  var a = {videoUrl, posterUrl, posterImgUrl, title};
  for (var i=0, I=headings.length; i<I; i++)
    a[headings[i]] = texts[i].replace(/[^ -~]/g, ' ').replace(/\s+/g, ' ');
  return a;
}

function downloadFile(url, dst, o={}) {
  if (fs.existsSync(dst) && !o.overwrite) return;
  cpExec(`curl -L "${url}" --output "${dst}"`);
}


function headingMd(x, k) {
  if (!x[k] || !x[k].replace(/other/i, '')) return '';
  return `### ${k}\n\n` + `${x[k].replace(/\.$/, '')}.\n\n\n`;
}

function headingTxt(x, k) {
  if (!x[k] || !x[k].replace(/other/i, '')) return '';
  return `${k}:\n` + `${x[k].replace(/\.$/, '')}.\n\n`;
}


function detailsMd(x) {
  var a = `# ${x.title}\n\n`;
  a += `![](${x.posterImgUrl})\n\n`;
  a += `${x['Technology Description']}\n\n`;
  a += `[Poster](${x.posterUrl})\n`;
  a += `[Video](${x.videoUrl})\n\n<br>\n\n\n`;
  a += `### Faculty Name\n\n`
  a += `${x['Faculty Name'].split(/,\s*|,?\s+and\s+/g).join(`<br>\n`)}\n\n\n`;
  a += headingMd(x, 'Research Area');
  a += headingMd(x, 'Type of Work');
  a += headingMd(x, 'Current State of work');
  a += headingMd(x, 'Potential Applications');
  a += headingMd(x, 'Keywords');
  return a.trim()+'\n';
}

function detailsTxt(x) {
  var a = '';
  a += `${x['Technology Description']}\n\n`;
  a += `Poster: ${x.posterUrl}\n`;
  a += `Video: ${x.videoUrl}\n\n\n`;
  a += `Faculty Name:\n`
  a += `${x['Faculty Name'].split(/,\s*/g).join(`\n`)}\n\n`;
  a += headingTxt(x, 'Research Area');
  a += headingTxt(x, 'Type of Work');
  a += headingTxt(x, 'Current State of work');
  a += headingTxt(x, 'Potential Applications');
  a += headingTxt(x, 'Keywords');
  return a.trim()+'\n';
}


function tableMd(dir) {
  var urlpre = `https://github.com/iiithf/rnd-showcase-2021/blob/main/${dir}/`;
  var table = '| S No. | Title | Poster | Video |\n|-|-|-|-|\n';
  var tlinks = '', plinks = '', vlinks = '';
  for (var f of fs.readdirSync(dir)) {
    if (!(/^\d\d.*?.md$/.test(f))) continue;
    var d = readFile(dir+'/'+f);
    var sno = f.substring(0, 2);
    var title = f.slice(3, -3).trim();
    var m = d.match(/\[Poster\]\((.*?)\)/);
    var poster = m? m[1] : '';
    var m = d.match(/\[Video\]\((.*?)\)/);
    var video = m? m[1] : '';
    var plink = poster? `[P-${sno}]` : `*P-${sno}*`;
    var vlink = video?  `[V-${sno}]` : `*V-${sno}*`;
    table += `| [${sno}] | [${title}][${sno}] | ${plink} | ${vlink} |\n`;
    tlinks += `[${sno}]: ${urlpre}${encodeURIComponent(f)}\n`;
    if (poster) plinks += `[P-${sno}]: ${poster}\n`;
    if (video)  vlinks += `[V-${sno}]: ${video}\n`;
  }
  var md = `${table}\n\n${tlinks}\n${plinks}\n${vlinks}\n`;
  writeFile(`${dir}/index.md`, md);
}


function mergeCsv() {
  var csv = CSV_COLUMNS.map(c => `"${c}"`).join()+'\n';
  for (var d of fs.readdirSync('.', {withFileTypes: true})) {
    if (!d.isDirectory()) continue;
    if (!(/^[A-Z][A-Za-z]+$/.test(d.name))) continue;
    var f = path.join(d.name, 'index.csv');
    var rows = readFile(f).replace(/.*?\n/, '');
    csv += rows;
  }
  writeFile('index.csv', csv);
}


async function main(pth) {
  if (pth==='mergeCsv') return mergeCsv();
  if (pth.startsWith('tableMd:')) return tableMd(pth.substring(8));
  var dir = path.dirname(pth);
  var urls = readFile(pth).trim().split('\n');
  var postfixTxt = readFile('postfix.txt');
  imgur.setCredentials(E.IMGUR_USERNAME, E.IMGUR_PASSWORD, E.IMGUR_CLIENTID);
  var csv = CSV_COLUMNS.map(c => `"${c}"`).join()+'\n';
  process.chdir(dir);
  for (var i=0, I=urls.length; i<I; i++) {
    var id = String(i+1).padStart(2, '0');
    var body = await fetchBody(urls[i]);
    if (!body.querySelector('#div1 h3')) continue;
    var x = readDetails(body);

    var videoPth = `${id}. ${x.title}${path.extname(x.videoUrl)}`;
    var posterPth = `${id}. ${x.title}${path.extname(x.posterUrl)}`;
    var posterImgPth = `${id}. ${x.title}${path.extname(x.posterImgUrl)}`;
    var mdPth = `${id}. ${x.title}.md`;
    var txtPth = `${id}. ${x.title}.log`;

    // downloadFile(x.videoUrl, videoPth);
    // downloadFile(x.posterImgUrl, posterImgPth);
    // downloadFile(x.posterUrl, posterPth);
    // var a = await imgur.uploadFile(posterImgPth)
    // console.log(posterImgPth, a);

    x.posterUrl = encodeURIComponent(posterPth);
    x.posterImgUrl = encodeURIComponent(posterImgPth);
    writeFile(mdPth, detailsMd(x));
    x.posterUrl = encodeURI(`https://github.com/iiithf/rnd-showcase-2021/blob/main/${dir}/${posterPth}`);
    writeFile(txtPth, detailsTxt(x)+postfixTxt);

    var row =
      `"${dir}","${x.title}","${x['Faculty Name']}","${x['Research Area']||''}",` +
      `"${x['Type of Work']||''}","${x['Current State of work']||''}",` +
      `"${x['Potential Applications']||''}","${x['Keywords']||''}"`;
    csv += row.replace(/[\r\n\s]+/g, ' ').trim()+'\n';
    console.log('\n\n');
  }
  writeFile(`index.csv`, csv);
}
main(process.argv[2]);
