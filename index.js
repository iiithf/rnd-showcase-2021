const fs = require('fs');
const os = require('os')
const cp = require('child_process');
const path = require('path');
const {JSDOM} = require('jsdom');
const fetch = require('node-fetch');

const stdio = [0, 1, 2];




function delay(ms) {
  return new Promise(fres => setTimeout(fres, ms));
}


function readFile(pth) {
  var d = fs.readFileSync(pth, 'utf8');
  return d.replace(/\r?\n/g, '\n');
}

function writeFile(pth, d) {
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
  var posterImg = div1.querySelector('img').getAttribute('src');
  var title = div1.querySelector('h3').textContent.replace(/[^\w\s,-]/g, ' - ').replace(/\s+/g, ' ').trim();
  var headings = [...div1.querySelectorAll('h4 b')].map(e => e.textContent.trim());
  var texts = [...div1.querySelectorAll('h5')].map(e => e.textContent.trim());
  var a = {videoUrl, posterUrl, posterImg, title};
  for (var i=0, I=headings.length; i<I; i++)
    a[headings[i]] = texts[i].replace(/[^ -~]/g, ' ').replace(/\s+/g, ' ');
  return a;
}

function downloadFile(url, nam) {
  var filename = `${nam}${path.extname(url)}`;
  cpExec(`curl -L "${url}" --output "${filename}"`);
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
  a += `![](${x.posterImg})\n\n`;
  a += `${x['Technology Description']}\n\n`;
  a += `[Poster](${x.posterUrl})\n`;
  a += `[Video](${x.videoUrl})\n\n<br>\n\n\n`;
  a += `### Faculty Name\n\n`
  a += `${x['Faculty Name'].split(/,\s*/g).join(`<br>\n`)}\n\n\n`;
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



async function main(pth) {
  var dir = path.dirname(pth);
  var urls = readFile(pth).trim().split('\n');
  var postfixTxt = readFile('postfix.txt');
  process.chdir(dir);
  for (var i=0, I=urls.length; i<I; i++) {
    var id = String(i+1).padStart(2, '0');
    var body = await fetchBody(urls[i]);
    var x = readDetails(body);
    downloadFile(x.videoUrl, `${id}. ${x.title}`);
    downloadFile(x.posterImg, `${id}. ${x.title}`);
    downloadFile(x.posterUrl, `${id}. ${x.title}`);
    x.posterUrl = encodeURIComponent(`${id}. ${x.title}${path.extname(x.posterUrl)}`);
    x.posterImg = encodeURIComponent(`${id}. ${x.title}${path.extname(x.posterImg)}`);
    writeFile(`${id}. ${x.title}.md`, detailsMd(x));
    x.posterUrl = encodeURI(`https://github.com/iiithf/rnd-showcase-2021/blob/main/${dir}/${id}. ${x.title}.pdf`);
    writeFile(`${id}. ${x.title}.log`, detailsTxt(x)+postfixTxt);
    console.log('\n\n');
  }
}
main(process.argv[2]);
