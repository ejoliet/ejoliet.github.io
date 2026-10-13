const cf = require('../app.js');
const assert = require('assert');
// parsing
assert.deepStrictEqual(cf.parseRepoInput('https://github.com/astropy/pyvo.git'), {owner:'astropy',name:'pyvo'});
assert.deepStrictEqual(cf.parseRepoInput('astropy/pyvo'), {owner:'astropy',name:'pyvo'});
assert.strictEqual(cf.parseRepoInput('nope'), null);
assert.deepStrictEqual(cf.extractDois('[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.1234.svg)](https://doi.org/10.5281/zenodo.1234). Also 10.3847/1538-3881/aabc4f.'), ['10.5281/zenodo.1234','10.3847/1538-3881/aabc4f']);
assert.deepStrictEqual(cf.extractBibcodes('see https://ui.adsabs.harvard.edu/abs/2018AJ....156..123A/abstract'), ['2018AJ....156..123A']);
const re = cf.repoUrlRegex('astropy','astropy');
assert(re.test('https://github.com/astropy/astropy/tree/v6.0')); assert(!re.test('github.com/astropy/astropy-helpers')); assert(re.test('at github.com/astropy/astropy.')); assert(!re.test('github.com/astropy/astropy.js'));
// DataCite collapse
const v1={provider:'datacite',kind:'software',title:'astropy/astropy: v6.0.0',doi:'10.5281/zenodo.200',conceptDoi:'10.5281/zenodo.100',authors:[{family:'Robitaille',given:'Thomas'}],date:'2023-11-25',version:'v6.0.0',structured:true,raw:{relatedIdentifiers:[{relatedIdentifier:'https://github.com/astropy/astropy/tree/v6.0.0'}]}};
const v0={...v1,doi:'10.5281/zenodo.150',date:'2022-01-01',version:'v5.0',raw:{}};
const col=cf.collapseVersions([v0,v1]);
assert.strictEqual(col.length,1); assert.strictEqual(col[0].doi,'10.5281/zenodo.200'); assert.strictEqual(col[0].versions,2);
const paper={provider:'ads',kind:'article',title:'The Astropy Project: Sustaining and Growing a Community-oriented Open-source Project and the Latest Major Release (v5.0) of the Core Package',doi:'10.3847/1538-4357/ac7c74',bibcode:'2022ApJ...935..167A',authors:[{family:'Astropy Collaboration'},{family:'Price-Whelan',given:'Adrian M.',orcid:'https://orcid.org/0000-0003-0872-7098'}],year:2022,journal:'The Astrophysical Journal',volume:'935',issue:'2',start:'167',raw:{abstract:'see github.com/astropy/astropy'}};
const merged=cf.mergeCandidates([...col,paper]);
const repo={owner:'astropy',name:'astropy',url:'https://github.com/astropy/astropy',homepage:'https://www.astropy.org',license:'BSD-3-Clause',release:{tag:'v6.0.0',date:'2023-11-25'},contributors:[{login:'astrofrog',name:'Thomas Robitaille'}],declared:{cff:'',dois:['10.3847/1538-4357/ac7c74'],bibcodes:[],authors:[],name:''}};
const scored=merged.map(c=>cf.scoreCandidate(c,repo)).sort((a,b)=>b.score-a.score);
for (const s of scored) console.log(s.score, s.candidate.title.slice(0,40), s.signals.map(x=>x.code).join(','));
// drafts
const dSoft=cf.draftFrom(scored.find(s=>s.candidate.kind==='software'),repo,{doiKind:'concept'});
assert.strictEqual(dSoft.doi,'10.5281/zenodo.100');
console.log('\n'+cf.buildCff(dSoft)); console.log(cf.renderApa(dSoft)); console.log(cf.renderBibtex(dSoft)); console.log(cf.validateDraft(dSoft));
const dPaper=cf.draftFrom(scored.find(s=>s.candidate.kind==='article'),repo,{doiKind:'concept'});
console.log('\n'+cf.buildCff(dPaper)); console.log(cf.renderApa(dPaper)); console.log(cf.renderBibtex(dPaper)); console.log(cf.validateDraft(dPaper));
// GitHub doc example parity
const gh={citeType:'software',kindTop:'software',title:'My Research Software',version:'2.0.4',doi:'10.5281/zenodo.1234',dateReleased:'2017-12-18',url:'https://github.com/github-linguist/linguist',authors:[{family:'Lisa',given:'Mona',orcid:'https://orcid.org/0000-0000-0000-0000'},{family:'Bot',given:'Hew',orcid:'https://orcid.org/0000-0000-0000-0000'}]};
assert.strictEqual(cf.renderApa(gh),'Lisa, M., & Bot, H. (2017). My Research Software (Version 2.0.4) [Computer software]. https://doi.org/10.5281/zenodo.1234');
console.log('\n'+cf.renderBibtex(gh));
console.log('ALL PASS');
