// AIDEV-NOTE: run with `node test/scan.test.js`. Extracts the pure scanner from index.html and runs it on a synthetic repo.
const fs=require('fs');const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const js=html.match(/<script>([\s\S]*)<\/script>/)[1];
const start=js.indexOf('// ---------- file selection'), end=js.indexOf('// ---------- .env.example');
const code=js.slice(start,end);
const state={repo:{owner:'o',name:'r'},sha:'abc'};
const scan=new Function('state', code+'; return scan;')(state);
const files=[
 {path:'app/config.py', text:`import os
DB_URL = os.environ['DATABASE_URL']
DEBUG = os.getenv('APP_DEBUG', 'false')
SECRET = os.environ.get("SECRET_KEY")
port = int(os.environ.get('PORT', 8000))
timeout = os.getenv('HTTP_TIMEOUT', 30)
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='MYAPP_')
uvicorn.run(app, host='0.0.0.0', port=8000)
parser.add_argument('--workers')
with open('config.yaml') as f: pass
import boto3
client = redis.Redis()`},
 {path:'web/server.js', text:`const port = process.env.PORT || '3000';
const key = process.env["STRIPE_API_KEY"];
const base = process.env.API_BASE_URL ?? "http://localhost:8080";
app.listen(3000);
program.option('--verbose');`},
 {path:'cmd/main.go', text:`v := os.Getenv("KAFKA_BROKERS")
x, ok := os.LookupEnv("LOG_LEVEL")
flag.String("config", "c.yaml", "")
http.ListenAndServe(":9090", nil)`},
 {path:'Dockerfile', text:`FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
ENV APP_MODE=prod
ARG BUILD_TAG
EXPOSE 8000
CMD ["uvicorn", "app:app"]`},
 {path:'docker-compose.yml', text:`services:
  api:
    image: x
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgres://db/x
      - REDIS_HOST=redis
  db:
    image: postgres
    environment:
      POSTGRES_PASSWORD: example`},
 {path:'.github/workflows/ci.yml', text:`env:
  FOO_BAR: 1
steps:
  - run: echo \${{ secrets.NPM_TOKEN }}`},
 {path:'.env.example', text:`DATABASE_URL=postgres://localhost/app
SECRET_KEY=
UNUSED_THING=1`},
 {path:'README.md', text:'Set APP_DEBUG=true to see logs.'},
 {path:'scripts/run.sh', text:'echo $HOME $1 ${DATA_DIR:-/data} $OUTPUT_BUCKET'},
 {path:'src/main/resources/application.yml', text:'spring:\n  datasource:\n    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost/x}'},
 {path:'pyproject.toml', text:'[project]\nrequires-python = ">=3.11"\n[project.scripts]\nmytool = "app.cli:main"\n[tool.uv]\n'},
 {path:'Makefile', text:'.PHONY: test\ntest:\n\tpytest\nbuild: test\n\tdocker build .\n'},
];
const r=scan(files);
for(const e of r.env) console.log(e.name.padEnd(24), 'hits='+e.hits.length, 'def='+[...e.defaults].join('|'), 'doc='+[...e.documented].join(','), e.secret?'SECRET':'');
console.log('PORTS', r.ports.map(p=>p.port+':'+[...p.kinds].join('/')));
console.log('SERVICES', r.services.map(s=>s.name));
console.log('FLAGS', r.flags.map(f=>f.flag+'('+f.via+')'));
console.log('CONFIGS', r.configs.map(c=>c.file));
console.log('RUNTIME', JSON.stringify(r.runtime).slice(0,700));
