const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html','utf8').replace('<script src="app.js"></script>','');
const dom = new JSDOM(html, { url: 'https://ejoliet.github.io/citefinder/?repo=astropy/astropy', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
const J = (o)=>({ ok:true, status:200, headers:{get:()=>null}, json:async()=>o, text:async()=>typeof o==='string'?o:JSON.stringify(o) });
const N = ()=>({ ok:false, status:404, headers:{get:()=>null} });
const calls=[];
w.fetch = async (url, opts) => {
  calls.push([url, opts.headers]);
  if (url==='https://api.github.com/repos/astropy/astropy') return J({full_name:'astropy/astropy', html_url:'https://github.com/astropy/astropy', description:'Astronomy and astrophysics core library', homepage:'https://www.astropy.org', license:{spdx_id:'BSD-3-Clause'}});
  if (url.endsWith('/releases/latest')) return J({tag_name:'v6.0.0', published_at:'2023-11-25T00:00:00Z'});
  if (url.endsWith('/contents')) return J([{type:'file',name:'CITATION.cff',path:'CITATION.cff'},{type:'file',name:'README.rst',path:'README.rst'}]);
  if (url.includes('/contributors')) return J([{login:'astrofrog',type:'User'},{login:'dependabot[bot]',type:'Bot'}]);
  if (url.endsWith('/readme')) return J('Cite: https://doi.org/10.3847/1538-4357/ac7c74 and [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.100.svg)]');
  if (url.endsWith('/contents/CITATION.cff')) return J('cff-version: 1.2.0\nmessage: "cite"\ntitle: "Astropy"\ndoi: 10.5281/zenodo.100\n');
  if (url.includes('/users/astrofrog')) return J({name:'Thomas Robitaille'});
  if (url.startsWith('https://api.datacite.org')) return J({data:[{attributes:{doi:'10.5281/zenodo.200',titles:[{title:'astropy/astropy: v6.0.0'}],creators:[{name:'Robitaille, Thomas',givenName:'Thomas',familyName:'Robitaille',nameIdentifiers:[{nameIdentifier:'https://orcid.org/0000-0002-8642-1329',nameIdentifierScheme:'ORCID'}]},{name:'Astropy Developers',nameType:'Organizational'}],publicationYear:2023,version:'v6.0.0',types:{resourceTypeGeneral:'Software'},relatedIdentifiers:[{relatedIdentifier:'https://github.com/astropy/astropy/tree/v6.0.0',relationType:'IsSupplementTo',relatedIdentifierType:'URL'},{relatedIdentifier:'10.5281/zenodo.100',relationType:'IsVersionOf',relatedIdentifierType:'DOI'}],dates:[{date:'2023-11-25',dateType:'Issued'}],url:'https://zenodo.org/records/200'}}]});
  if (url.startsWith('https://doi.org/10.3847')) return J({type:'article-journal',title:'The Astropy Project',DOI:'10.3847/1538-4357/ac7c74',author:[{literal:'Astropy Collaboration'},{family:'Price-Whelan',given:'Adrian M.'}],issued:{'date-parts':[[2022,8,1]]},'container-title':'The Astrophysical Journal',volume:'935',issue:'2',page:'167'});
  if (url.startsWith('https://doi.org/')) return N();
  if (url.startsWith('https://api.crossref.org')) return J({message:{items:[{DOI:'10.1000/xyz',title:['Unrelated thing'],author:[{family:'Doe',given:'J'}],issued:{'date-parts':[[2020]]},type:'journal-article'}]}});
  if (url.startsWith('https://api.adsabs.harvard.edu')) throw new TypeError('Failed to fetch');
  if (url.startsWith('https://pub.orcid.org')) return J({'expanded-result':[{'orcid-id':'0000-0002-8642-1329','given-names':'Thomas','family-names':'Robitaille','institution-name':['Aperio']}]});
  return N();
};
w.eval(fs.readFileSync(__dirname + '/../app.js','utf8'));
const d = w.document, $=id=>d.getElementById(id);
(async()=>{
  // add ADS token
  d.getElementById('tok-ads').value='SECRET-ADS'; [...d.querySelectorAll('#provider-settings button')].find(b=>b.textContent==='Save'&&b.previousSibling.id==='tok-ads').click();
  console.log('session:', w.sessionStorage.getItem('citefinder:tokens'), 'local:', w.localStorage.getItem('citefinder:settings'));
  console.log('repo prefill:', $('repo').value);
  $('repo-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  await new Promise(r=>setTimeout(r,500));
  console.log('status:', [...$('provider-status').children].map(e=>e.textContent));
  console.log('lede:', $('pick-lede').textContent);
  for (const li of $('candidates').children) console.log(' -', li.querySelector('.score').textContent.replace('score',''), '|', li.querySelector('.cand-title').textContent, '|', [...li.querySelectorAll('.signals li')].map(x=>x.textContent).join('; '));
  console.log('weak btn:', $('toggle-weak').hidden, $('toggle-weak').textContent);
  console.log('preview (declared?):\n'+$('preview').textContent);
  // choose software candidate (2nd or so)
  const items=[...$('candidates').children];
  const soft=items.find(li=>li.querySelector('.cand-title').textContent.startsWith('astropy/astropy'));
  soft.click();
  console.log('\nCFF:\n'+$('preview').textContent); console.log('checks:', [...$('checks').children].map(x=>x.className+':'+x.textContent));
  // find ORCID for second author? edit title
  const paper=items.find(li=>li.querySelector('.cand-title').textContent==='The Astropy Project'); paper.click();
  console.log('\nPAPER CFF:\n'+$('preview').textContent);
  d.querySelector('[data-tab="apa"]').click(); console.log('APA:', $('preview').textContent);
  d.querySelector('[data-tab="bibtex"]').click(); console.log('BIB:', $('preview').textContent);
  // ORCID button
  const fb=[...d.querySelectorAll('#editor button')].find(b=>b.textContent==='Find ORCID'); fb.click(); await new Promise(r=>setTimeout(r,100));
  const pick=d.querySelector('.orcid-results button'); console.log('orcid option:', pick && pick.textContent); pick && pick.click();
  d.querySelector('[data-tab="cff"]').click(); console.log('after orcid has id:', $('preview').textContent.includes('0000-0002-8642-1329'));
  // token leakage check
  const leaks=calls.filter(([u,h])=>JSON.stringify(h||{}).includes('SECRET-ADS') && !u.startsWith('https://api.adsabs.harvard.edu'));
  console.log('ADS token sent elsewhere:', leaks.length, '| ADS calls carried token:', calls.filter(([u,h])=>u.startsWith('https://api.adsabs')&&JSON.stringify(h).includes('SECRET-ADS')).length);
  console.log('download disabled:', $('download').disabled);
})();
