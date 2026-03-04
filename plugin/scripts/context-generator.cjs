"use strict";var gt=Object.create;var k=Object.defineProperty;var St=Object.getOwnPropertyDescriptor;var ht=Object.getOwnPropertyNames;var bt=Object.getPrototypeOf,ft=Object.prototype.hasOwnProperty;var Ot=(n,e)=>{for(var t in e)k(n,t,{get:e[t],enumerable:!0})},se=(n,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of ht(e))!ft.call(n,r)&&r!==t&&k(n,r,{get:()=>e[r],enumerable:!(s=St(e,r))||s.enumerable});return n};var D=(n,e,t)=>(t=n!=null?gt(bt(n)):{},se(e||!n||!n.__esModule?k(t,"default",{value:n,enumerable:!0}):t,n)),Nt=n=>se(k({},"__esModule",{value:!0}),n);var Pt={};Ot(Pt,{generateContext:()=>te});module.exports=Nt(Pt);var pt=D(require("path"),1),ut=require("os"),mt=require("fs");var ge=require("bun:sqlite");var b=require("path"),de=require("os"),_e=require("fs");var ce=require("url");var I=require("fs"),w=require("path"),oe=require("os");var ne="bugfix,feature,refactor,discovery,decision,change",re="how-it-works,why-it-exists,what-changed,problem-solution,gotcha,pattern,trade-off";var C=class{static DEFAULTS={CLAUDE_MEM_MODEL:"claude-sonnet-4-5",CLAUDE_MEM_CONTEXT_OBSERVATIONS:"50",CLAUDE_MEM_WORKER_PORT:"37777",CLAUDE_MEM_WORKER_HOST:"127.0.0.1",CLAUDE_MEM_SKIP_TOOLS:"ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion",CLAUDE_MEM_PROVIDER:"dashscope",CLAUDE_MEM_CLAUDE_AUTH_METHOD:"cli",CLAUDE_MEM_GEMINI_API_KEY:"",CLAUDE_MEM_GEMINI_API_URL:"https://generativelanguage.googleapis.com/v1/models",CLAUDE_MEM_GEMINI_MODEL:"gemini-2.5-flash-lite",CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED:"true",CLAUDE_MEM_OPENROUTER_API_KEY:"",CLAUDE_MEM_OPENROUTER_MODEL:"xiaomi/mimo-v2-flash:free",CLAUDE_MEM_OPENROUTER_SITE_URL:"",CLAUDE_MEM_OPENROUTER_APP_NAME:"claude-mem",CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_OPENROUTER_MAX_TOKENS:"100000",CLAUDE_MEM_DASHSCOPE_API_KEY:"",CLAUDE_MEM_DASHSCOPE_MODEL:"qwen-plus",CLAUDE_MEM_DASHSCOPE_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_DASHSCOPE_MAX_TOKENS:"100000",CLAUDE_MEM_DATA_DIR:(0,w.join)((0,oe.homedir)(),".claude-mem"),CLAUDE_MEM_LOG_LEVEL:"INFO",CLAUDE_MEM_PYTHON_VERSION:"3.13",CLAUDE_CODE_PATH:"",CLAUDE_MEM_MODE:"code--zh",CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT:"true",CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES:ne,CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS:re,CLAUDE_MEM_CONTEXT_FULL_COUNT:"0",CLAUDE_MEM_CONTEXT_FULL_FIELD:"narrative",CLAUDE_MEM_CONTEXT_SESSION_COUNT:"10",CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY:"true",CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE:"false",CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT:"true",CLAUDE_MEM_EMBEDDING_FUNCTION:"dashscope:text-embedding-v3:768",CLAUDE_MEM_BUDGET_ENABLED:"false",CLAUDE_MEM_BUDGET_PRESET:"claude-haiku",CLAUDE_MEM_BUDGET_DAILY_LIMIT:"1.00",CLAUDE_MEM_BUDGET_MONTHLY_LIMIT:"20.00",CLAUDE_MEM_BUDGET_CUSTOM_PRICING:"",CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED:"false",CLAUDE_MEM_MAX_CONCURRENT_AGENTS:"2",CLAUDE_MEM_EXCLUDED_PROJECTS:"",CLAUDE_MEM_FOLDER_MD_EXCLUDE:"[]",CLAUDE_MEM_CHROMA_ENABLED:"true",CLAUDE_MEM_CHROMA_MODE:"local",CLAUDE_MEM_CHROMA_HOST:"127.0.0.1",CLAUDE_MEM_CHROMA_PORT:"8000",CLAUDE_MEM_CHROMA_SSL:"false",CLAUDE_MEM_CHROMA_API_KEY:"",CLAUDE_MEM_CHROMA_TENANT:"default_tenant",CLAUDE_MEM_CHROMA_DATABASE:"default_database"};static getAllDefaults(){return{...this.DEFAULTS}}static get(e){return this.DEFAULTS[e]}static getInt(e){let t=this.get(e);return parseInt(t,10)}static getBool(e){let t=this.get(e);return t==="true"||t===!0}static applyEnvOverrides(e){let t={...e};for(let s of Object.keys(this.DEFAULTS))process.env[s]!==void 0&&(t[s]=process.env[s]);return t}static loadFromFile(e){try{if(!(0,I.existsSync)(e)){let i=this.getAllDefaults();try{let a=(0,w.dirname)(e);(0,I.existsSync)(a)||(0,I.mkdirSync)(a,{recursive:!0}),(0,I.writeFileSync)(e,JSON.stringify(i,null,2),"utf-8"),console.log("[SETTINGS] Created settings file with defaults:",e)}catch(a){console.warn("[SETTINGS] Failed to create settings file, using in-memory defaults:",e,a)}return this.applyEnvOverrides(i)}let t=(0,I.readFileSync)(e,"utf-8"),s=JSON.parse(t),r=s;if(s.env&&typeof s.env=="object"){r=s.env;try{(0,I.writeFileSync)(e,JSON.stringify(r,null,2),"utf-8"),console.log("[SETTINGS] Migrated settings file from nested to flat schema:",e)}catch(i){console.warn("[SETTINGS] Failed to auto-migrate settings file:",e,i)}}let o={...this.DEFAULTS};for(let i of Object.keys(this.DEFAULTS))r[i]!==void 0&&(o[i]=r[i]);return this.applyEnvOverrides(o)}catch(t){return console.warn("[SETTINGS] Failed to load settings, using defaults:",e,t),this.applyEnvOverrides(this.getAllDefaults())}}};var A=require("fs"),M=require("path"),ae=require("os"),H=(o=>(o[o.DEBUG=0]="DEBUG",o[o.INFO=1]="INFO",o[o.WARN=2]="WARN",o[o.ERROR=3]="ERROR",o[o.SILENT=4]="SILENT",o))(H||{}),ie=(0,M.join)((0,ae.homedir)(),".claude-mem");function Rt(n){return n.replace(/([\?&](?:key|token|api[_-]?key|apikey|secret|password|access[_-]?token)=)[^&\s"']+/gi,"$1***")}var W=class{level=null;useColor;logFilePath=null;logFileInitialized=!1;constructor(){this.useColor=process.stdout.isTTY??!1}ensureLogFileInitialized(){if(!this.logFileInitialized){this.logFileInitialized=!0;try{let e=(0,M.join)(ie,"logs");(0,A.existsSync)(e)||(0,A.mkdirSync)(e,{recursive:!0});let t=new Date().toISOString().split("T")[0];this.logFilePath=(0,M.join)(e,`claude-mem-${t}.log`)}catch(e){console.error("[LOGGER] Failed to initialize log file:",e),this.logFilePath=null}}}getLevel(){if(this.level===null)try{let e=(0,M.join)(ie,"settings.json");if((0,A.existsSync)(e)){let t=(0,A.readFileSync)(e,"utf-8"),r=(JSON.parse(t).CLAUDE_MEM_LOG_LEVEL||"INFO").toUpperCase();this.level=H[r]??1}else this.level=1}catch{this.level=1}return this.level}correlationId(e,t){return`obs-${e}-${t}`}sessionId(e){return`session-${e}`}formatData(e){if(e==null)return"";if(typeof e=="string")return e;if(typeof e=="number"||typeof e=="boolean")return e.toString();if(typeof e=="object"){if(e instanceof Error)return this.getLevel()===0?`${e.message}
${e.stack}`:e.message;if(Array.isArray(e))return`[${e.length} items]`;let t=Object.keys(e);return t.length===0?"{}":t.length<=3?JSON.stringify(e):`{${t.length} keys: ${t.slice(0,3).join(", ")}...}`}return String(e)}formatTool(e,t){if(!t)return e;let s=t;if(typeof t=="string")try{s=JSON.parse(t)}catch{s=t}if(e==="Bash"&&s.command)return`${e}(${s.command})`;if(s.file_path)return`${e}(${s.file_path})`;if(s.notebook_path)return`${e}(${s.notebook_path})`;if(e==="Glob"&&s.pattern)return`${e}(${s.pattern})`;if(e==="Grep"&&s.pattern)return`${e}(${s.pattern})`;if(s.url)return`${e}(${s.url})`;if(s.query)return`${e}(${s.query})`;if(e==="Task"){if(s.subagent_type)return`${e}(${s.subagent_type})`;if(s.description)return`${e}(${s.description})`}return e==="Skill"&&s.skill?`${e}(${s.skill})`:e==="LSP"&&s.operation?`${e}(${s.operation})`:e}formatTimestamp(e){let t=e.getFullYear(),s=String(e.getMonth()+1).padStart(2,"0"),r=String(e.getDate()).padStart(2,"0"),o=String(e.getHours()).padStart(2,"0"),i=String(e.getMinutes()).padStart(2,"0"),a=String(e.getSeconds()).padStart(2,"0"),d=String(e.getMilliseconds()).padStart(3,"0");return`${t}-${s}-${r} ${o}:${i}:${a}.${d}`}log(e,t,s,r,o){if(e<this.getLevel())return;this.ensureLogFileInitialized();let i=this.formatTimestamp(new Date),a=H[e].padEnd(5),d=t.padEnd(6),c="";r?.correlationId?c=`[${r.correlationId}] `:r?.sessionId&&(c=`[session-${r.sessionId}] `);let p="";o!=null&&(o instanceof Error?p=this.getLevel()===0?`
${o.message}
${o.stack}`:` ${o.message}`:this.getLevel()===0&&typeof o=="object"?p=`
`+JSON.stringify(o,null,2):p=" "+this.formatData(o));let l="";if(r){let{sessionId:S,memorySessionId:f,correlationId:m,...g}=r;Object.keys(g).length>0&&(l=` {${Object.entries(g).map(([O,Tt])=>`${O}=${Tt}`).join(", ")}}`)}let T=`[${i}] [${a}] [${d}] ${c}${s}${l}${p}`,u=Rt(T);if(this.logFilePath)try{(0,A.appendFileSync)(this.logFilePath,u+`
`,"utf8")}catch(S){process.stderr.write(`[LOGGER] Failed to write to log file: ${S}
`)}else process.stderr.write(u+`
`)}debug(e,t,s,r){this.log(0,e,t,s,r)}info(e,t,s,r){this.log(1,e,t,s,r)}warn(e,t,s,r){this.log(2,e,t,s,r)}error(e,t,s,r){this.log(3,e,t,s,r)}dataIn(e,t,s,r){this.info(e,`\u2192 ${t}`,s,r)}dataOut(e,t,s,r){this.info(e,`\u2190 ${t}`,s,r)}success(e,t,s,r){this.info(e,`\u2713 ${t}`,s,r)}failure(e,t,s,r){this.error(e,`\u2717 ${t}`,s,r)}timing(e,t,s,r){this.info(e,`\u23F1 ${t}`,r,{duration:`${s}ms`})}happyPathError(e,t,s,r,o=""){let c=((new Error().stack||"").split(`
`)[2]||"").match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/),p=c?`${c[1].split("/").pop()}:${c[2]}`:"unknown",l={...s,location:p};return this.warn(e,`[HAPPY-PATH] ${t}`,l,r),o}},E=new W;var Ct={};function It(){return typeof __dirname<"u"?__dirname:(0,b.dirname)((0,ce.fileURLToPath)(Ct.url))}var At=It(),R=C.get("CLAUDE_MEM_DATA_DIR"),y=process.env.CLAUDE_CONFIG_DIR||(0,b.join)((0,de.homedir)(),".claude"),qt=(0,b.join)(y,"plugins","marketplaces","thedotmack"),Jt=(0,b.join)(R,"archives"),zt=(0,b.join)(R,"logs"),Qt=(0,b.join)(R,"trash"),Zt=(0,b.join)(R,"backups"),es=(0,b.join)(R,"modes"),ts=(0,b.join)(R,"settings.json"),Ee=(0,b.join)(R,"claude-mem.db"),ss=(0,b.join)(R,"vector-db"),ns=(0,b.join)(R,"observer-sessions"),rs=(0,b.join)(y,"settings.json"),os=(0,b.join)(y,"commands"),is=(0,b.join)(y,"CLAUDE.md");function le(n){(0,_e.mkdirSync)(n,{recursive:!0})}function pe(){return(0,b.join)(At,"..")}var ue=require("crypto");var yt=3e4;function me(n,e,t){return(0,ue.createHash)("sha256").update((n||"")+(e||"")+(t||"")).digest("hex").slice(0,16)}function Te(n,e,t){let s=t-yt;return n.prepare("SELECT id, created_at_epoch FROM observations WHERE content_hash = ? AND created_at_epoch > ?").get(e,s)}var F=class{db;constructor(e=Ee){e!==":memory:"&&le(R),this.db=new ge.Database(e),this.db.run("PRAGMA journal_mode = WAL"),this.db.run("PRAGMA synchronous = NORMAL"),this.db.run("PRAGMA foreign_keys = ON"),this.initializeSchema(),this.ensureWorkerPortColumn(),this.ensurePromptTrackingColumns(),this.removeSessionSummariesUniqueConstraint(),this.addObservationHierarchicalFields(),this.makeObservationsTextNullable(),this.createUserPromptsTable(),this.ensureDiscoveryTokensColumn(),this.createAIAnalysisTable(),this.createPendingMessagesTable(),this.renameSessionIdColumns(),this.repairSessionIdColumnRename(),this.addFailedAtEpochColumn(),this.addOnUpdateCascadeToForeignKeys(),this.addObservationContentHashColumn(),this.addSessionCustomTitleColumn(),this.createBudgetTables(),this.addContentSessionIdToObservations()}initializeSchema(){this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `),this.db.run(`
      CREATE TABLE IF NOT EXISTS sdk_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT UNIQUE NOT NULL,
        memory_session_id TEXT UNIQUE,
        project TEXT NOT NULL,
        user_prompt TEXT,
        started_at TEXT NOT NULL,
        started_at_epoch INTEGER NOT NULL,
        completed_at TEXT,
        completed_at_epoch INTEGER,
        status TEXT CHECK(status IN ('active', 'completed', 'failed')) NOT NULL DEFAULT 'active'
      );

      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_claude_id ON sdk_sessions(content_session_id);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_sdk_id ON sdk_sessions(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_project ON sdk_sessions(project);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_status ON sdk_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_started ON sdk_sessions(started_at_epoch DESC);

      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project);
      CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
      CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at_epoch DESC);

      CREATE TABLE IF NOT EXISTS session_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT UNIQUE NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(4,new Date().toISOString())}ensureWorkerPortColumn(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(s=>s.name==="worker_port")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN worker_port INTEGER"),E.debug("DB","Added worker_port column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(5,new Date().toISOString())}ensurePromptTrackingColumns(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(a=>a.name==="prompt_counter")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN prompt_counter INTEGER DEFAULT 0"),E.debug("DB","Added prompt_counter column to sdk_sessions table")),this.db.query("PRAGMA table_info(observations)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE observations ADD COLUMN prompt_number INTEGER"),E.debug("DB","Added prompt_number column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN prompt_number INTEGER"),E.debug("DB","Added prompt_number column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(6,new Date().toISOString())}removeSessionSummariesUniqueConstraint(){if(!this.db.query("PRAGMA index_list(session_summaries)").all().some(s=>s.unique===1)){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString());return}E.debug("DB","Removing UNIQUE constraint from session_summaries.memory_session_id");try{this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS session_summaries_new"),this.db.run(`
        CREATE TABLE session_summaries_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          memory_session_id TEXT NOT NULL,
          project TEXT NOT NULL,
          request TEXT,
          investigated TEXT,
          learned TEXT,
          completed TEXT,
          next_steps TEXT,
          files_read TEXT,
          files_edited TEXT,
          notes TEXT,
          prompt_number INTEGER,
          created_at TEXT NOT NULL,
          created_at_epoch INTEGER NOT NULL,
          FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
        )
      `),this.db.run(`
        INSERT INTO session_summaries_new
        SELECT id, memory_session_id, project, request, investigated, learned,
               completed, next_steps, files_read, files_edited, notes,
               prompt_number, created_at, created_at_epoch
        FROM session_summaries
      `),this.db.run("DROP TABLE session_summaries"),this.db.run("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.run(`
        CREATE INDEX idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
        CREATE INDEX idx_session_summaries_project ON session_summaries(project);
        CREATE INDEX idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString()),this.db.run("COMMIT")}catch(s){try{this.db.run("ROLLBACK")}catch{}throw s}E.debug("DB","Successfully removed UNIQUE constraint from session_summaries.memory_session_id")}addObservationHierarchicalFields(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(8))return;if(this.db.query("PRAGMA table_info(observations)").all().some(r=>r.name==="title")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString());return}E.debug("DB","Adding hierarchical fields to observations table"),this.db.run(`
      ALTER TABLE observations ADD COLUMN title TEXT;
      ALTER TABLE observations ADD COLUMN subtitle TEXT;
      ALTER TABLE observations ADD COLUMN facts TEXT;
      ALTER TABLE observations ADD COLUMN narrative TEXT;
      ALTER TABLE observations ADD COLUMN concepts TEXT;
      ALTER TABLE observations ADD COLUMN files_read TEXT;
      ALTER TABLE observations ADD COLUMN files_modified TEXT;
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString()),E.debug("DB","Successfully added hierarchical fields to observations table")}makeObservationsTextNullable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(9))return;let s=this.db.query("PRAGMA table_info(observations)").all().find(r=>r.name==="text");if(!s||s.notnull===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString());return}E.debug("DB","Making observations.text nullable");try{this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS observations_new"),this.db.run(`
        CREATE TABLE observations_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          memory_session_id TEXT NOT NULL,
          project TEXT NOT NULL,
          text TEXT,
          type TEXT NOT NULL,
          title TEXT,
          subtitle TEXT,
          facts TEXT,
          narrative TEXT,
          concepts TEXT,
          files_read TEXT,
          files_modified TEXT,
          prompt_number INTEGER,
          created_at TEXT NOT NULL,
          created_at_epoch INTEGER NOT NULL,
          FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
        )
      `),this.db.run(`
        INSERT INTO observations_new
        SELECT id, memory_session_id, project, text, type, title, subtitle, facts,
               narrative, concepts, files_read, files_modified, prompt_number,
               created_at, created_at_epoch
        FROM observations
      `),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(`
        CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
        CREATE INDEX idx_observations_project ON observations(project);
        CREATE INDEX idx_observations_type ON observations(type);
        CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString()),this.db.run("COMMIT")}catch(r){try{this.db.run("ROLLBACK")}catch{}throw r}E.debug("DB","Successfully made observations.text nullable")}createUserPromptsTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(10))return;if(this.db.query("PRAGMA table_info(user_prompts)").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString());return}E.debug("DB","Creating user_prompts table with FTS5 support"),this.db.run("BEGIN TRANSACTION"),this.db.run(`
      CREATE TABLE user_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT NOT NULL,
        prompt_number INTEGER NOT NULL,
        prompt_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(content_session_id) REFERENCES sdk_sessions(content_session_id) ON DELETE CASCADE
      );

      CREATE INDEX idx_user_prompts_claude_session ON user_prompts(content_session_id);
      CREATE INDEX idx_user_prompts_created ON user_prompts(created_at_epoch DESC);
      CREATE INDEX idx_user_prompts_prompt_number ON user_prompts(prompt_number);
      CREATE INDEX idx_user_prompts_lookup ON user_prompts(content_session_id, prompt_number);
    `);try{this.db.run(`
        CREATE VIRTUAL TABLE user_prompts_fts USING fts5(
          prompt_text,
          content='user_prompts',
          content_rowid='id'
        );
      `),this.db.run(`
        CREATE TRIGGER user_prompts_ai AFTER INSERT ON user_prompts BEGIN
          INSERT INTO user_prompts_fts(rowid, prompt_text)
          VALUES (new.id, new.prompt_text);
        END;

        CREATE TRIGGER user_prompts_ad AFTER DELETE ON user_prompts BEGIN
          INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
          VALUES('delete', old.id, old.prompt_text);
        END;

        CREATE TRIGGER user_prompts_au AFTER UPDATE ON user_prompts BEGIN
          INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
          VALUES('delete', old.id, old.prompt_text);
          INSERT INTO user_prompts_fts(rowid, prompt_text)
          VALUES (new.id, new.prompt_text);
        END;
      `)}catch(s){E.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},s)}this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),E.debug("DB","Successfully created user_prompts table")}ensureDiscoveryTokensColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(11))return;this.db.query("PRAGMA table_info(observations)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),E.debug("DB","Added discovery_tokens column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),E.debug("DB","Added discovery_tokens column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(11,new Date().toISOString())}createAIAnalysisTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(12))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_analysis'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(12,new Date().toISOString());return}E.debug("DB","Creating ai_analysis table with FTS5 support"),this.db.run("BEGIN TRANSACTION");try{this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_analysis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          memory_session_id TEXT NOT NULL,
          project TEXT NOT NULL,
          analysis_text TEXT NOT NULL,
          key_insights TEXT,
          connections TEXT,
          created_at TEXT NOT NULL,
          created_at_epoch INTEGER NOT NULL,
          discovery_tokens INTEGER DEFAULT 0,
          FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_ai_analysis_session ON ai_analysis(memory_session_id);
        CREATE INDEX IF NOT EXISTS idx_ai_analysis_project ON ai_analysis(project);
        CREATE INDEX IF NOT EXISTS idx_ai_analysis_created ON ai_analysis(created_at_epoch DESC);
      `),this.db.query("PRAGMA table_info(observations)").all().some(o=>o.name==="ai_analysis_id")||(this.db.run("ALTER TABLE observations ADD COLUMN ai_analysis_id INTEGER REFERENCES ai_analysis(id) ON DELETE SET NULL"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_ai_analysis ON observations(ai_analysis_id)")),this.db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ai_analysis_fts USING fts5(
          analysis_text,
          key_insights,
          connections,
          content='ai_analysis',
          content_rowid='id'
        );
      `),this.db.run(`
        CREATE TRIGGER IF NOT EXISTS ai_analysis_ai AFTER INSERT ON ai_analysis BEGIN
          INSERT INTO ai_analysis_fts(rowid, analysis_text, key_insights, connections)
          VALUES (new.id, new.analysis_text, new.key_insights, new.connections);
        END;

        CREATE TRIGGER IF NOT EXISTS ai_analysis_ad AFTER DELETE ON ai_analysis BEGIN
          INSERT INTO ai_analysis_fts(ai_analysis_fts, rowid, analysis_text, key_insights, connections)
          VALUES('delete', old.id, old.analysis_text, old.key_insights, old.connections);
        END;

        CREATE TRIGGER IF NOT EXISTS ai_analysis_au AFTER UPDATE ON ai_analysis BEGIN
          INSERT INTO ai_analysis_fts(ai_analysis_fts, rowid, analysis_text, key_insights, connections)
          VALUES('delete', old.id, old.analysis_text, old.key_insights, old.connections);
          INSERT INTO ai_analysis_fts(rowid, analysis_text, key_insights, connections)
          VALUES (new.id, new.analysis_text, new.key_insights, new.connections);
        END;
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(12,new Date().toISOString()),this.db.run("COMMIT")}catch(s){throw this.db.run("ROLLBACK"),s}E.debug("DB","Successfully created ai_analysis table with FTS5 support")}createPendingMessagesTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(16))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString());return}E.debug("DB","Creating pending_messages table"),this.db.run(`
      CREATE TABLE pending_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_db_id INTEGER NOT NULL,
        content_session_id TEXT NOT NULL,
        message_type TEXT NOT NULL CHECK(message_type IN ('observation', 'summarize')),
        tool_name TEXT,
        tool_input TEXT,
        tool_response TEXT,
        cwd TEXT,
        last_user_message TEXT,
        last_assistant_message TEXT,
        prompt_number INTEGER,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'processed', 'failed')),
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at_epoch INTEGER NOT NULL,
        started_processing_at_epoch INTEGER,
        completed_at_epoch INTEGER,
        FOREIGN KEY (session_db_id) REFERENCES sdk_sessions(id) ON DELETE CASCADE
      )
    `),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_session ON pending_messages(session_db_id)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_status ON pending_messages(status)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_claude_session ON pending_messages(content_session_id)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString()),E.debug("DB","pending_messages table created successfully")}renameSessionIdColumns(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(17))return;E.debug("DB","Checking session ID columns for semantic clarity rename");let t=0,s=(r,o,i)=>{let a=this.db.query(`PRAGMA table_info(${r})`).all(),d=a.some(p=>p.name===o);return a.some(p=>p.name===i)?!1:d?(this.db.run(`ALTER TABLE ${r} RENAME COLUMN ${o} TO ${i}`),E.debug("DB",`Renamed ${r}.${o} to ${i}`),!0):(E.warn("DB",`Column ${o} not found in ${r}, skipping rename`),!1)};s("sdk_sessions","claude_session_id","content_session_id")&&t++,s("sdk_sessions","sdk_session_id","memory_session_id")&&t++,s("pending_messages","claude_session_id","content_session_id")&&t++,s("observations","sdk_session_id","memory_session_id")&&t++,s("session_summaries","sdk_session_id","memory_session_id")&&t++,s("user_prompts","claude_session_id","content_session_id")&&t++,this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(17,new Date().toISOString()),t>0?E.debug("DB",`Successfully renamed ${t} session ID columns`):E.debug("DB","No session ID column renames needed (already up to date)")}repairSessionIdColumnRename(){this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(19)||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(19,new Date().toISOString())}addFailedAtEpochColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(20))return;this.db.query("PRAGMA table_info(pending_messages)").all().some(r=>r.name==="failed_at_epoch")||(this.db.run("ALTER TABLE pending_messages ADD COLUMN failed_at_epoch INTEGER"),E.debug("DB","Added failed_at_epoch column to pending_messages table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(20,new Date().toISOString())}createBudgetTables(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(24))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='budget_state'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(24,new Date().toISOString());return}E.debug("DB","Creating budget tracking tables"),this.db.run("BEGIN TRANSACTION");try{this.db.run(`
        CREATE TABLE IF NOT EXISTS budget_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          budget_date TEXT NOT NULL,
          budget_month TEXT NOT NULL,
          spent_today_micros INTEGER NOT NULL DEFAULT 0,
          spent_month_micros INTEGER NOT NULL DEFAULT 0,
          daily_limit_micros INTEGER NOT NULL DEFAULT 1000000,
          monthly_limit_micros INTEGER NOT NULL DEFAULT 20000000,
          version INTEGER NOT NULL DEFAULT 1,
          last_update_epoch INTEGER NOT NULL,
          CONSTRAINT spent_today_not_negative CHECK (spent_today_micros >= 0),
          CONSTRAINT spent_month_not_negative CHECK (spent_month_micros >= 0)
        )
      `),this.db.run(`
        CREATE TABLE IF NOT EXISTS budget_transactions (
          id TEXT PRIMARY KEY,
          phase TEXT NOT NULL CHECK (phase IN ('reserved', 'committed', 'rolled_back')),
          cost_micros INTEGER NOT NULL,
          provider TEXT NOT NULL,
          observation_id INTEGER,
          session_db_id INTEGER,
          created_at_epoch INTEGER NOT NULL,
          committed_at_epoch INTEGER,
          rolled_back_at_epoch INTEGER,
          error_reason TEXT,
          FOREIGN KEY(observation_id) REFERENCES observations(id) ON DELETE SET NULL,
          FOREIGN KEY(session_db_id) REFERENCES sdk_sessions(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_budget_tx_phase ON budget_transactions(phase);
        CREATE INDEX IF NOT EXISTS idx_budget_tx_created ON budget_transactions(created_at_epoch);
        CREATE INDEX IF NOT EXISTS idx_budget_tx_session ON budget_transactions(session_db_id)
      `),this.db.run(`
        CREATE TABLE IF NOT EXISTS budget_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date_key TEXT NOT NULL,
          month_key TEXT NOT NULL,
          provider TEXT NOT NULL,
          session_db_id INTEGER,
          observation_id INTEGER,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          cache_creation_tokens INTEGER DEFAULT 0,
          cache_read_tokens INTEGER DEFAULT 0,
          cost_micros INTEGER NOT NULL,
          price_input_per_m REAL,
          price_output_per_m REAL,
          created_at_epoch INTEGER NOT NULL,
          FOREIGN KEY(session_db_id) REFERENCES sdk_sessions(id) ON DELETE SET NULL,
          FOREIGN KEY(observation_id) REFERENCES observations(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_budget_records_date ON budget_records(date_key);
        CREATE INDEX IF NOT EXISTS idx_budget_records_month ON budget_records(month_key);
        CREATE INDEX IF NOT EXISTS idx_budget_records_provider ON budget_records(provider);
        CREATE INDEX IF NOT EXISTS idx_budget_records_session ON budget_records(session_db_id)
      `);let s=new Date,r=`${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,"0")}-${String(s.getDate()).padStart(2,"0")}`,o=r.substring(0,7);this.db.prepare(`
        INSERT OR IGNORE INTO budget_state (
          id, budget_date, budget_month,
          spent_today_micros, spent_month_micros,
          daily_limit_micros, monthly_limit_micros,
          version, last_update_epoch
        ) VALUES (
          1, ?, ?,
          0, 0,
          1000000, 20000000,
          1, ?
        )
      `).run(r,o,Date.now()),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(24,new Date().toISOString()),this.db.run("COMMIT")}catch(s){throw this.db.run("ROLLBACK"),s}E.debug("DB","Successfully created budget tracking tables")}addContentSessionIdToObservations(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(25))return;this.db.query("PRAGMA table_info(observations)").all().some(r=>r.name==="content_session_id")||(this.db.run("ALTER TABLE observations ADD COLUMN content_session_id TEXT"),this.db.run(`
        UPDATE observations SET content_session_id = (
          SELECT s.content_session_id FROM sdk_sessions s
          WHERE s.memory_session_id = observations.memory_session_id
        ) WHERE content_session_id IS NULL
      `),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_content_session_id ON observations(content_session_id)"),E.debug("DB","Added content_session_id column to observations with backfill and index")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(25,new Date().toISOString())}addOnUpdateCascadeToForeignKeys(){if(!this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(21)){E.debug("DB","Adding ON UPDATE CASCADE to FK constraints on observations and session_summaries"),this.db.run("PRAGMA foreign_keys = OFF"),this.db.run("BEGIN TRANSACTION");try{this.db.run("DROP TRIGGER IF EXISTS observations_ai"),this.db.run("DROP TRIGGER IF EXISTS observations_ad"),this.db.run("DROP TRIGGER IF EXISTS observations_au"),this.db.run("DROP TABLE IF EXISTS observations_new"),this.db.run(`
        CREATE TABLE observations_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          memory_session_id TEXT NOT NULL,
          project TEXT NOT NULL,
          text TEXT,
          type TEXT NOT NULL,
          title TEXT,
          subtitle TEXT,
          facts TEXT,
          narrative TEXT,
          concepts TEXT,
          files_read TEXT,
          files_modified TEXT,
          prompt_number INTEGER,
          discovery_tokens INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          created_at_epoch INTEGER NOT NULL,
          ai_analysis_id INTEGER REFERENCES ai_analysis(id) ON DELETE SET NULL,
          FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
        )
      `),this.db.run(`
        INSERT INTO observations_new
        SELECT id, memory_session_id, project, text, type, title, subtitle, facts,
               narrative, concepts, files_read, files_modified, prompt_number,
               discovery_tokens, created_at, created_at_epoch, ai_analysis_id
        FROM observations
      `),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(`
        CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
        CREATE INDEX idx_observations_project ON observations(project);
        CREATE INDEX idx_observations_type ON observations(type);
        CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
        CREATE INDEX IF NOT EXISTS idx_observations_ai_analysis ON observations(ai_analysis_id);
      `),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'").all().length>0&&this.db.run(`
          CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
            INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
            VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
          END;

          CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
            INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
            VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
          END;

          CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
            INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
            VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
            INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
            VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
          END;
        `),this.db.run("DROP TABLE IF EXISTS session_summaries_new"),this.db.run(`
        CREATE TABLE session_summaries_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          memory_session_id TEXT NOT NULL,
          project TEXT NOT NULL,
          request TEXT,
          investigated TEXT,
          learned TEXT,
          completed TEXT,
          next_steps TEXT,
          files_read TEXT,
          files_edited TEXT,
          notes TEXT,
          prompt_number INTEGER,
          discovery_tokens INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          created_at_epoch INTEGER NOT NULL,
          FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
        )
      `),this.db.run(`
        INSERT INTO session_summaries_new
        SELECT id, memory_session_id, project, request, investigated, learned,
               completed, next_steps, files_read, files_edited, notes,
               prompt_number, discovery_tokens, created_at, created_at_epoch
        FROM session_summaries
      `),this.db.run("DROP TRIGGER IF EXISTS session_summaries_ai"),this.db.run("DROP TRIGGER IF EXISTS session_summaries_ad"),this.db.run("DROP TRIGGER IF EXISTS session_summaries_au"),this.db.run("DROP TABLE session_summaries"),this.db.run("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.run(`
        CREATE INDEX idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
        CREATE INDEX idx_session_summaries_project ON session_summaries(project);
        CREATE INDEX idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
      `),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_summaries_fts'").all().length>0&&this.db.run(`
          CREATE TRIGGER IF NOT EXISTS session_summaries_ai AFTER INSERT ON session_summaries BEGIN
            INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
            VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
          END;

          CREATE TRIGGER IF NOT EXISTS session_summaries_ad AFTER DELETE ON session_summaries BEGIN
            INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
            VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
          END;

          CREATE TRIGGER IF NOT EXISTS session_summaries_au AFTER UPDATE ON session_summaries BEGIN
            INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
            VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
            INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
            VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
          END;
        `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(21,new Date().toISOString()),this.db.run("COMMIT"),this.db.run("PRAGMA foreign_keys = ON"),E.debug("DB","Successfully added ON UPDATE CASCADE to FK constraints")}catch(t){throw this.db.run("ROLLBACK"),this.db.run("PRAGMA foreign_keys = ON"),t}}}addObservationContentHashColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(22))return;this.db.query("PRAGMA table_info(observations)").all().some(r=>r.name==="content_hash")||(this.db.run("ALTER TABLE observations ADD COLUMN content_hash TEXT"),this.db.run("UPDATE observations SET content_hash = substr(hex(randomblob(8)), 1, 16) WHERE content_hash IS NULL"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_content_hash ON observations(content_hash, created_at_epoch)"),E.debug("DB","Added content_hash column to observations table with backfill and index")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString())}addSessionCustomTitleColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(23))return;this.db.query("PRAGMA table_info(sdk_sessions)").all().some(r=>r.name==="custom_title")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN custom_title TEXT"),E.debug("DB","Added custom_title column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(23,new Date().toISOString())}updateMemorySessionId(e,t){this.db.prepare(`
      UPDATE sdk_sessions
      SET memory_session_id = ?
      WHERE id = ?
    `).run(t,e)}ensureMemorySessionIdRegistered(e,t){let s=this.db.prepare(`
      SELECT id, memory_session_id FROM sdk_sessions WHERE id = ?
    `).get(e);if(!s)throw new Error(`Session ${e} not found in sdk_sessions`);s.memory_session_id!==t&&(this.db.prepare(`
        UPDATE sdk_sessions SET memory_session_id = ? WHERE id = ?
      `).run(t,e),E.info("DB","Registered memory_session_id before storage (FK fix)",{sessionDbId:e,oldId:s.memory_session_id,newId:t}))}getRecentSummaries(e,t=10){return this.db.prepare(`
      SELECT
        request, investigated, learned, completed, next_steps,
        files_read, files_edited, notes, prompt_number, created_at
      FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getRecentSummariesWithSessionInfo(e,t=3){return this.db.prepare(`
      SELECT
        memory_session_id, request, learned, completed, next_steps,
        prompt_number, created_at
      FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getRecentObservations(e,t=20){return this.db.prepare(`
      SELECT type, text, prompt_number, created_at
      FROM observations
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getAllRecentObservations(e=100){return this.db.prepare(`
      SELECT id, type, title, subtitle, text, project, prompt_number, created_at, created_at_epoch
      FROM observations
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllRecentSummaries(e=50){return this.db.prepare(`
      SELECT id, request, investigated, learned, completed, next_steps,
             files_read, files_edited, notes, project, prompt_number,
             created_at, created_at_epoch
      FROM session_summaries
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllRecentUserPrompts(e=100){return this.db.prepare(`
      SELECT
        up.id,
        up.content_session_id,
        s.project,
        up.prompt_number,
        up.prompt_text,
        up.created_at,
        up.created_at_epoch
      FROM user_prompts up
      LEFT JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      ORDER BY up.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllProjects(){return this.db.prepare(`
      SELECT DISTINCT project
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
      ORDER BY project ASC
    `).all().map(s=>s.project)}getLatestUserPrompt(e){return this.db.prepare(`
      SELECT
        up.*,
        s.memory_session_id,
        s.project
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.content_session_id = ?
      ORDER BY up.created_at_epoch DESC
      LIMIT 1
    `).get(e)}getRecentSessionsWithStatus(e,t=3){return this.db.prepare(`
      SELECT * FROM (
        SELECT
          s.memory_session_id,
          s.status,
          s.started_at,
          s.started_at_epoch,
          s.user_prompt,
          CASE WHEN sum.memory_session_id IS NOT NULL THEN 1 ELSE 0 END as has_summary
        FROM sdk_sessions s
        LEFT JOIN session_summaries sum ON s.memory_session_id = sum.memory_session_id
        WHERE s.project = ? AND s.memory_session_id IS NOT NULL
        GROUP BY s.memory_session_id
        ORDER BY s.started_at_epoch DESC
        LIMIT ?
      )
      ORDER BY started_at_epoch ASC
    `).all(e,t)}getObservationsForSession(e){return this.db.prepare(`
      SELECT title, subtitle, type, prompt_number
      FROM observations
      WHERE memory_session_id = ?
      ORDER BY created_at_epoch ASC
    `).all(e)}getObservationById(e){return this.db.prepare(`
      SELECT *
      FROM observations
      WHERE id = ?
    `).get(e)||null}getObservationsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:r,project:o,memory_session_id:i,type:a,concepts:d,files:c}=t,p=s==="date_asc"?"ASC":"DESC",l=r?`LIMIT ${r}`:"",T=e.map(()=>"?").join(","),u=[...e],S=[];if(i&&(S.push("memory_session_id = ?"),u.push(i)),o&&(S.push("project = ?"),u.push(o)),a)if(Array.isArray(a)){let g=a.map(()=>"?").join(",");S.push(`type IN (${g})`),u.push(...a)}else S.push("type = ?"),u.push(a);if(d){let g=Array.isArray(d)?d:[d],h=g.map(()=>"EXISTS (SELECT 1 FROM json_each(concepts) WHERE value = ?)");u.push(...g),S.push(`(${h.join(" OR ")})`)}if(c){let g=Array.isArray(c)?c:[c],h=g.map(()=>"(EXISTS (SELECT 1 FROM json_each(files_read) WHERE value LIKE ?) OR EXISTS (SELECT 1 FROM json_each(files_modified) WHERE value LIKE ?))");g.forEach(O=>{u.push(`%${O}%`,`%${O}%`)}),S.push(`(${h.join(" OR ")})`)}let f=S.length>0?`WHERE id IN (${T}) AND ${S.join(" AND ")}`:`WHERE id IN (${T})`;return this.db.prepare(`
      SELECT *
      FROM observations
      ${f}
      ORDER BY created_at_epoch ${p}
      ${l}
    `).all(...u)}getSummaryForSession(e){return this.db.prepare(`
      SELECT
        request, investigated, learned, completed, next_steps,
        files_read, files_edited, notes, prompt_number, created_at,
        created_at_epoch
      FROM session_summaries
      WHERE memory_session_id = ?
      ORDER BY created_at_epoch DESC
      LIMIT 1
    `).get(e)||null}getFilesForSession(e){let s=this.db.prepare(`
      SELECT files_read, files_modified
      FROM observations
      WHERE memory_session_id = ?
    `).all(e),r=new Set,o=new Set;for(let i of s){if(i.files_read){let a=JSON.parse(i.files_read);Array.isArray(a)&&a.forEach(d=>r.add(d))}if(i.files_modified){let a=JSON.parse(i.files_modified);Array.isArray(a)&&a.forEach(d=>o.add(d))}}return{filesRead:Array.from(r),filesModified:Array.from(o)}}getSessionById(e){return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project, user_prompt, custom_title
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}getSdkSessionsBySessionIds(e){if(e.length===0)return[];let t=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project, user_prompt, custom_title,
             started_at, started_at_epoch, completed_at, completed_at_epoch, status
      FROM sdk_sessions
      WHERE memory_session_id IN (${t})
      ORDER BY started_at_epoch DESC
    `).all(...e)}getPromptNumberFromUserPrompts(e){return this.db.prepare(`
      SELECT COUNT(*) as count FROM user_prompts WHERE content_session_id = ?
    `).get(e).count}createSDKSession(e,t,s,r){let o=new Date,i=o.getTime(),a=this.db.prepare(`
      SELECT id FROM sdk_sessions WHERE content_session_id = ?
    `).get(e);return a?(t&&this.db.prepare(`
          UPDATE sdk_sessions SET project = ?
          WHERE content_session_id = ? AND (project IS NULL OR project = '')
        `).run(t,e),r&&this.db.prepare(`
          UPDATE sdk_sessions SET custom_title = ?
          WHERE content_session_id = ? AND custom_title IS NULL
        `).run(r,e),a.id):(this.db.prepare(`
      INSERT INTO sdk_sessions
      (content_session_id, memory_session_id, project, user_prompt, custom_title, started_at, started_at_epoch, status)
      VALUES (?, NULL, ?, ?, ?, ?, ?, 'active')
    `).run(e,t,s,r||null,o.toISOString(),i),this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e).id)}saveUserPrompt(e,t,s){let r=new Date,o=r.getTime();return this.db.prepare(`
      INSERT INTO user_prompts
      (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `).run(e,t,s,r.toISOString(),o).lastInsertRowid}getUserPrompt(e,t){return this.db.prepare(`
      SELECT prompt_text
      FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
      LIMIT 1
    `).get(e,t)?.prompt_text??null}storeObservation(e,t,s,r,o=0,i,a){let d=i??Date.now(),c=new Date(d).toISOString(),p=me(e,s.title,s.narrative),l=Te(this.db,p,d);if(l)return{id:l.id,createdAtEpoch:l.created_at_epoch};let T=a||null;T||(T=this.db.prepare("SELECT content_session_id FROM sdk_sessions WHERE memory_session_id = ?").get(e)?.content_session_id||null);let S=this.db.prepare(`
      INSERT INTO observations
      (memory_session_id, content_session_id, project, type, title, subtitle, facts, narrative, concepts,
       files_read, files_modified, prompt_number, discovery_tokens, content_hash, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,T,t,s.type,s.title,s.subtitle,JSON.stringify(s.facts),s.narrative,JSON.stringify(s.concepts),JSON.stringify(s.files_read),JSON.stringify(s.files_modified),r||null,o,p,c,d);return{id:Number(S.lastInsertRowid),createdAtEpoch:d}}storeSummary(e,t,s,r,o=0,i){let a=i??Date.now(),d=new Date(a).toISOString(),p=this.db.prepare(`
      INSERT INTO session_summaries
      (memory_session_id, project, request, investigated, learned, completed,
       next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,t,s.request,s.investigated,s.learned,s.completed,s.next_steps,s.notes,r||null,o,d,a);return{id:Number(p.lastInsertRowid),createdAtEpoch:a}}storeObservations(e,t,s,r,o,i=0,a,d){let c=a??Date.now(),p=new Date(c).toISOString(),l=d||null;return l||(l=this.db.prepare("SELECT content_session_id FROM sdk_sessions WHERE memory_session_id = ?").get(e)?.content_session_id||null),this.db.transaction(()=>{let u=[],S=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, content_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, created_at, created_at_epoch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);for(let m of s){let g=S.run(e,l,t,m.type,m.title,m.subtitle,JSON.stringify(m.facts),m.narrative,JSON.stringify(m.concepts),JSON.stringify(m.files_read),JSON.stringify(m.files_modified),o||null,i,p,c);u.push(Number(g.lastInsertRowid))}let f=null;if(r){let g=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,r.request,r.investigated,r.learned,r.completed,r.next_steps,r.notes,o||null,i,p,c);f=Number(g.lastInsertRowid)}return{observationIds:u,summaryId:f,createdAtEpoch:c}})()}storeObservationsAndMarkComplete(e,t,s,r,o,i,a,d=0,c){let p=c??Date.now(),l=new Date(p).toISOString();return this.db.transaction(()=>{let u=[],S=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, created_at, created_at_epoch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);for(let g of s){let h=S.run(e,t,g.type,g.title,g.subtitle,JSON.stringify(g.facts),g.narrative,JSON.stringify(g.concepts),JSON.stringify(g.files_read),JSON.stringify(g.files_modified),a||null,d,l,p);u.push(Number(h.lastInsertRowid))}let f;if(r){let h=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,r.request,r.investigated,r.learned,r.completed,r.next_steps,r.notes,a||null,d,l,p);f=Number(h.lastInsertRowid)}return this.db.prepare(`
        UPDATE pending_messages
        SET
          status = 'processed',
          completed_at_epoch = ?,
          tool_input = NULL,
          tool_response = NULL
        WHERE id = ? AND status = 'processing'
      `).run(p,o),{observationIds:u,summaryId:f,createdAtEpoch:p}})()}getSessionSummariesByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:r,project:o,memory_session_id:i}=t,a=s==="date_asc"?"ASC":"DESC",d=r?`LIMIT ${r}`:"",c=e.map(()=>"?").join(","),p=[...e],l=[];i&&(l.push("memory_session_id = ?"),p.push(i)),o&&(l.push("project = ?"),p.push(o));let T=l.length>0?`WHERE id IN (${c}) AND ${l.join(" AND ")}`:`WHERE id IN (${c})`;return this.db.prepare(`
      SELECT * FROM session_summaries
      ${T}
      ORDER BY created_at_epoch ${a}
      ${d}
    `).all(...p)}getUserPromptsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:r,project:o,memory_session_id:i}=t,a=s==="date_asc"?"ASC":"DESC",d=r?`LIMIT ${r}`:"",c=e.map(()=>"?").join(","),p=[...e],l=[];o&&(l.push("s.project = ?"),p.push(o)),i&&(l.push("s.memory_session_id = ?"),p.push(i));let T=l.length>0?`AND ${l.join(" AND ")}`:"";return this.db.prepare(`
      SELECT
        up.*,
        s.project,
        s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.id IN (${c}) ${T}
      ORDER BY up.created_at_epoch ${a}
      ${d}
    `).all(...p)}getTimelineAroundTimestamp(e,t=10,s=10,r){return this.getTimelineAroundObservation(null,e,t,s,r)}getTimelineAroundObservation(e,t,s=10,r=10,o){let i=o?"AND project = ?":"",a=o?[o]:[],d,c;if(e!==null){let m=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id <= ? ${i}
        ORDER BY id DESC
        LIMIT ?
      `,g=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id >= ? ${i}
        ORDER BY id ASC
        LIMIT ?
      `;try{let h=this.db.prepare(m).all(e,...a,s+1),O=this.db.prepare(g).all(e,...a,r+1);if(h.length===0&&O.length===0)return{observations:[],sessions:[],prompts:[]};d=h.length>0?h[h.length-1].created_at_epoch:t,c=O.length>0?O[O.length-1].created_at_epoch:t}catch(h){return E.error("DB","Error getting boundary observations",void 0,{error:h,project:o}),{observations:[],sessions:[],prompts:[]}}}else{let m=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch <= ? ${i}
        ORDER BY created_at_epoch DESC
        LIMIT ?
      `,g=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch >= ? ${i}
        ORDER BY created_at_epoch ASC
        LIMIT ?
      `;try{let h=this.db.prepare(m).all(t,...a,s),O=this.db.prepare(g).all(t,...a,r+1);if(h.length===0&&O.length===0)return{observations:[],sessions:[],prompts:[]};d=h.length>0?h[h.length-1].created_at_epoch:t,c=O.length>0?O[O.length-1].created_at_epoch:t}catch(h){return E.error("DB","Error getting boundary timestamps",void 0,{error:h,project:o}),{observations:[],sessions:[],prompts:[]}}}let p=`
      SELECT *
      FROM observations
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${i}
      ORDER BY created_at_epoch ASC
    `,l=`
      SELECT *
      FROM session_summaries
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${i}
      ORDER BY created_at_epoch ASC
    `,T=`
      SELECT up.*, s.project, s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.created_at_epoch >= ? AND up.created_at_epoch <= ? ${i.replace("project","s.project")}
      ORDER BY up.created_at_epoch ASC
    `,u=this.db.prepare(p).all(d,c,...a),S=this.db.prepare(l).all(d,c,...a),f=this.db.prepare(T).all(d,c,...a);return{observations:u,sessions:S.map(m=>({id:m.id,memory_session_id:m.memory_session_id,project:m.project,request:m.request,completed:m.completed,next_steps:m.next_steps,created_at:m.created_at,created_at_epoch:m.created_at_epoch})),prompts:f.map(m=>({id:m.id,content_session_id:m.content_session_id,prompt_number:m.prompt_number,prompt_text:m.prompt_text,project:m.project,created_at:m.created_at,created_at_epoch:m.created_at_epoch}))}}getPromptById(e){return this.db.prepare(`
      SELECT
        p.id,
        p.content_session_id,
        p.prompt_number,
        p.prompt_text,
        s.project,
        p.created_at,
        p.created_at_epoch
      FROM user_prompts p
      LEFT JOIN sdk_sessions s ON p.content_session_id = s.content_session_id
      WHERE p.id = ?
      LIMIT 1
    `).get(e)||null}getPromptsByIds(e){if(e.length===0)return[];let t=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT
        p.id,
        p.content_session_id,
        p.prompt_number,
        p.prompt_text,
        s.project,
        p.created_at,
        p.created_at_epoch
      FROM user_prompts p
      LEFT JOIN sdk_sessions s ON p.content_session_id = s.content_session_id
      WHERE p.id IN (${t})
      ORDER BY p.created_at_epoch DESC
    `).all(...e)}getSessionSummaryById(e){return this.db.prepare(`
      SELECT
        id,
        memory_session_id,
        content_session_id,
        project,
        user_prompt,
        request_summary,
        learned_summary,
        status,
        created_at,
        created_at_epoch
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}getOrCreateManualSession(e){let t=`manual-${e}`,s=`manual-content-${e}`;if(this.db.prepare("SELECT memory_session_id FROM sdk_sessions WHERE memory_session_id = ?").get(t))return t;let o=new Date;return this.db.prepare(`
      INSERT INTO sdk_sessions (memory_session_id, content_session_id, project, started_at, started_at_epoch, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(t,s,e,o.toISOString(),o.getTime()),E.info("SESSION","Created manual session",{memorySessionId:t,project:e}),t}close(){this.db.close()}importSdkSession(e){let t=this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e.content_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO sdk_sessions (
        content_session_id, memory_session_id, project, user_prompt,
        started_at, started_at_epoch, completed_at, completed_at_epoch, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.content_session_id,e.memory_session_id,e.project,e.user_prompt,e.started_at,e.started_at_epoch,e.completed_at,e.completed_at_epoch,e.status).lastInsertRowid}}importSessionSummary(e){let t=this.db.prepare("SELECT id FROM session_summaries WHERE memory_session_id = ?").get(e.memory_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO session_summaries (
        memory_session_id, project, request, investigated, learned,
        completed, next_steps, files_read, files_edited, notes,
        prompt_number, discovery_tokens, created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.memory_session_id,e.project,e.request,e.investigated,e.learned,e.completed,e.next_steps,e.files_read,e.files_edited,e.notes,e.prompt_number,e.discovery_tokens||0,e.created_at,e.created_at_epoch).lastInsertRowid}}importObservation(e){let t=this.db.prepare(`
      SELECT id FROM observations
      WHERE memory_session_id = ? AND title = ? AND created_at_epoch = ?
    `).get(e.memory_session_id,e.title,e.created_at_epoch);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO observations (
        memory_session_id, project, text, type, title, subtitle,
        facts, narrative, concepts, files_read, files_modified,
        prompt_number, discovery_tokens, created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.memory_session_id,e.project,e.text,e.type,e.title,e.subtitle,e.facts,e.narrative,e.concepts,e.files_read,e.files_modified,e.prompt_number,e.discovery_tokens||0,e.created_at,e.created_at_epoch).lastInsertRowid}}importUserPrompt(e){let t=this.db.prepare(`
      SELECT id FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
    `).get(e.content_session_id,e.prompt_number);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO user_prompts (
        content_session_id, prompt_number, prompt_text,
        created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?)
    `).run(e.content_session_id,e.prompt_number,e.prompt_text,e.created_at,e.created_at_epoch).lastInsertRowid}}storeAIAnalysis(e,t,s,r=[],o=[],i=[],a=0){let d=Date.now(),c=new Date(d).toISOString();return this.db.transaction(()=>{let T=this.db.prepare(`
        INSERT INTO ai_analysis
        (memory_session_id, project, analysis_text, key_insights, connections,
         discovery_tokens, created_at, created_at_epoch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(e,t,s,r.length>0?JSON.stringify(r):null,o.length>0?JSON.stringify(o):null,a,c,d),u=Number(T.lastInsertRowid);if(i.length>0){let S=this.db.prepare(`
          UPDATE observations
          SET ai_analysis_id = ?
          WHERE id = ?
        `);for(let f of i)S.run(u,f);E.info("DB","Linked observations to AI analysis",{analysisId:u,observationCount:i.length,project:t})}return{id:u,createdAtEpoch:d}})()}getAIAnalysisById(e){let s=this.db.prepare(`
      SELECT * FROM ai_analysis
      WHERE id = ?
    `).get(e);return s?{id:s.id,memorySessionId:s.memory_session_id,project:s.project,analysisText:s.analysis_text,keyInsights:s.key_insights?JSON.parse(s.key_insights):[],connections:s.connections?JSON.parse(s.connections):[],createdAt:s.created_at,createdAtEpoch:s.created_at_epoch,discoveryTokens:s.discovery_tokens}:null}getRecentAIAnalyses(e,t=10){return this.db.prepare(`
      SELECT * FROM ai_analysis
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t).map(o=>({id:o.id,memorySessionId:o.memory_session_id,project:o.project,analysisText:o.analysis_text,keyInsights:o.key_insights?JSON.parse(o.key_insights):[],connections:o.connections?JSON.parse(o.connections):[],createdAt:o.created_at,createdAtEpoch:o.created_at_epoch,discoveryTokens:o.discovery_tokens}))}getObservationsForAnalysis(e){return this.db.prepare(`
      SELECT id FROM observations
      WHERE ai_analysis_id = ?
      ORDER BY created_at_epoch ASC
    `).all(e).map(r=>r.id)}getExistingAnalysisForObservations(e){if(e.length===0)return null;let t=e.map(()=>"?").join(","),r=this.db.prepare(`
      SELECT DISTINCT ai_analysis_id
      FROM observations
      WHERE id IN (${t})
      AND ai_analysis_id IS NOT NULL
      LIMIT 1
    `).get(...e);return r?r.ai_analysis_id:null}searchAIAnalyses(e,t,s=10){return this.db.prepare(`
      SELECT a.*
      FROM ai_analysis a
      JOIN ai_analysis_fts fts ON a.id = fts.rowid
      WHERE ai_analysis_fts MATCH ?
      AND a.project = ?
      ORDER BY a.created_at_epoch DESC
      LIMIT ?
    `).all(e,t,s).map(i=>({id:i.id,memorySessionId:i.memory_session_id,project:i.project,analysisText:i.analysis_text,keyInsights:i.key_insights?JSON.parse(i.key_insights):[],connections:i.connections?JSON.parse(i.connections):[],createdAt:i.created_at,createdAtEpoch:i.created_at_epoch,discoveryTokens:i.discovery_tokens}))}};var Se=D(require("path"),1);function he(n){if(!n||n.trim()==="")return E.warn("PROJECT_NAME","Empty cwd provided, using fallback",{cwd:n}),"unknown-project";let e=Se.default.basename(n);if(e===""){if(process.platform==="win32"){let s=n.match(/^([A-Z]):\\/i);if(s){let o=`drive-${s[1].toUpperCase()}`;return E.info("PROJECT_NAME","Drive root detected",{cwd:n,projectName:o}),o}}return E.warn("PROJECT_NAME","Root directory detected, using fallback",{cwd:n}),"unknown-project"}return e}var be=D(require("path"),1),fe=require("os");var v=require("fs"),$=require("path");var N=class n{static instance=null;activeMode=null;modesDir;constructor(){let e=pe(),t=[(0,$.join)(e,"modes"),(0,$.join)(e,"..","plugin","modes")],s=t.find(r=>(0,v.existsSync)(r));this.modesDir=s||t[0]}static getInstance(){return n.instance||(n.instance=new n),n.instance}parseInheritance(e){let t=e.split("--");if(t.length===1)return{hasParent:!1,parentId:"",overrideId:""};if(t.length>2)throw new Error(`Invalid mode inheritance: ${e}. Only one level of inheritance supported (parent--override)`);return{hasParent:!0,parentId:t[0],overrideId:e}}isPlainObject(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}deepMerge(e,t){let s={...e};for(let r in t){let o=t[r],i=e[r];this.isPlainObject(o)&&this.isPlainObject(i)?s[r]=this.deepMerge(i,o):s[r]=o}return s}loadModeFile(e){let t=(0,$.join)(this.modesDir,`${e}.json`);if(!(0,v.existsSync)(t))throw new Error(`Mode file not found: ${t}`);let s=(0,v.readFileSync)(t,"utf-8");return JSON.parse(s)}loadMode(e){let t=this.parseInheritance(e);if(!t.hasParent)try{let d=this.loadModeFile(e);return this.activeMode=d,E.debug("SYSTEM",`Loaded mode: ${d.name} (${e})`,void 0,{types:d.observation_types.map(c=>c.id),concepts:d.observation_concepts.map(c=>c.id)}),d}catch{if(E.warn("SYSTEM",`Mode file not found: ${e}, falling back to 'code'`),e==="code")throw new Error("Critical: code.json mode file missing");return this.loadMode("code")}let{parentId:s,overrideId:r}=t,o;try{o=this.loadMode(s)}catch{E.warn("SYSTEM",`Parent mode '${s}' not found for ${e}, falling back to 'code'`),o=this.loadMode("code")}let i;try{i=this.loadModeFile(r),E.debug("SYSTEM",`Loaded override file: ${r} for parent ${s}`)}catch{return E.warn("SYSTEM",`Override file '${r}' not found, using parent mode '${s}' only`),this.activeMode=o,o}if(!i)return E.warn("SYSTEM",`Invalid override file: ${r}, using parent mode '${s}' only`),this.activeMode=o,o;let a=this.deepMerge(o,i);return this.activeMode=a,E.debug("SYSTEM",`Loaded mode with inheritance: ${a.name} (${e} = ${s} + ${r})`,void 0,{parent:s,override:r,types:a.observation_types.map(d=>d.id),concepts:a.observation_concepts.map(d=>d.id)}),a}getActiveMode(){if(!this.activeMode)throw new Error("No mode loaded. Call loadMode() first.");return this.activeMode}getObservationTypes(){return this.getActiveMode().observation_types}getObservationConcepts(){return this.getActiveMode().observation_concepts}getTypeIcon(e){return this.getObservationTypes().find(s=>s.id===e)?.emoji||"\u{1F4DD}"}getWorkEmoji(e){return this.getObservationTypes().find(s=>s.id===e)?.work_emoji||"\u{1F4DD}"}validateType(e){return this.getObservationTypes().some(t=>t.id===e)}getTypeLabel(e){return this.getObservationTypes().find(s=>s.id===e)?.label||e}};function Y(n){let e=be.default.join((0,fe.homedir)(),".claude-mem","settings.json"),t=C.loadFromFile(e);if(n)for(let[a,d]of Object.entries(n))a in t&&(t[a]=d);let s=t.CLAUDE_MEM_MODE,r=s==="code"||s.startsWith("code--"),o,i;if(r)o=new Set(t.CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES.split(",").map(a=>a.trim()).filter(Boolean)),i=new Set(t.CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS.split(",").map(a=>a.trim()).filter(Boolean));else{let a=N.getInstance().getActiveMode();o=new Set(a.observation_types.map(d=>d.id)),i=new Set(a.observation_concepts.map(d=>d.id))}return{totalObservationCount:parseInt(t.CLAUDE_MEM_CONTEXT_OBSERVATIONS,10),fullObservationCount:parseInt(t.CLAUDE_MEM_CONTEXT_FULL_COUNT,10),sessionCount:parseInt(t.CLAUDE_MEM_CONTEXT_SESSION_COUNT,10),showReadTokens:t.CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS==="true",showWorkTokens:t.CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS==="true",showSavingsAmount:t.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT==="true",showSavingsPercent:t.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT==="true",observationTypes:o,observationConcepts:i,fullObservationField:t.CLAUDE_MEM_CONTEXT_FULL_FIELD,showLastSummary:t.CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY==="true",showLastMessage:t.CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE==="true"}}var _={reset:"\x1B[0m",bright:"\x1B[1m",dim:"\x1B[2m",cyan:"\x1B[36m",green:"\x1B[32m",yellow:"\x1B[33m",blue:"\x1B[34m",magenta:"\x1B[35m",gray:"\x1B[90m",red:"\x1B[31m"},Oe=4,V=1;function K(n){let e=(n.title?.length||0)+(n.subtitle?.length||0)+(n.narrative?.length||0)+JSON.stringify(n.facts||[]).length;return Math.ceil(e/Oe)}function q(n){let e=n.length,t=n.reduce((i,a)=>i+K(a),0),s=n.reduce((i,a)=>i+(a.discovery_tokens||0),0),r=s-t,o=s>0?Math.round(r/s*100):0;return{totalObservations:e,totalReadTokens:t,totalDiscoveryTokens:s,savings:r,savingsPercent:o}}function Lt(n){return N.getInstance().getWorkEmoji(n)}function L(n,e){let t=K(n),s=n.discovery_tokens||0,r=Lt(n.type),o=s>0?`${r} ${s.toLocaleString()}`:"-";return{readTokens:t,discoveryTokens:s,discoveryDisplay:o,workEmoji:r}}function P(n){return n.showReadTokens||n.showWorkTokens||n.showSavingsAmount||n.showSavingsPercent}var Ne=D(require("path"),1),X=require("fs");function J(n,e,t){let s=Array.from(t.observationTypes),r=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(",");return n.db.prepare(`
    SELECT
      id, memory_session_id, type, title, subtitle, narrative,
      facts, concepts, files_read, files_modified, discovery_tokens,
      created_at, created_at_epoch
    FROM observations
    WHERE project = ?
      AND type IN (${r})
      AND EXISTS (
        SELECT 1 FROM json_each(concepts)
        WHERE value IN (${i})
      )
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `).all(e,...s,...o,t.totalObservationCount)}function z(n,e,t){return n.db.prepare(`
    SELECT id, memory_session_id, request, investigated, learned, completed, next_steps, created_at, created_at_epoch
    FROM session_summaries
    WHERE project = ?
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `).all(e,t.sessionCount+V)}function Re(n,e,t){let s=Array.from(t.observationTypes),r=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(","),a=e.map(()=>"?").join(",");return n.db.prepare(`
    SELECT
      id, memory_session_id, type, title, subtitle, narrative,
      facts, concepts, files_read, files_modified, discovery_tokens,
      created_at, created_at_epoch, project
    FROM observations
    WHERE project IN (${a})
      AND type IN (${r})
      AND EXISTS (
        SELECT 1 FROM json_each(concepts)
        WHERE value IN (${i})
      )
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `).all(...e,...s,...o,t.totalObservationCount)}function Ie(n,e,t){let s=e.map(()=>"?").join(",");return n.db.prepare(`
    SELECT id, memory_session_id, request, investigated, learned, completed, next_steps, created_at, created_at_epoch, project
    FROM session_summaries
    WHERE project IN (${s})
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `).all(...e,t.sessionCount+V)}function Dt(n){return n.replace(/\//g,"-")}function Mt(n){try{if(!(0,X.existsSync)(n))return{userMessage:"",assistantMessage:""};let e=(0,X.readFileSync)(n,"utf-8").trim();if(!e)return{userMessage:"",assistantMessage:""};let t=e.split(`
`).filter(r=>r.trim()),s="";for(let r=t.length-1;r>=0;r--)try{let o=t[r];if(!o.includes('"type":"assistant"'))continue;let i=JSON.parse(o);if(i.type==="assistant"&&i.message?.content&&Array.isArray(i.message.content)){let a="";for(let d of i.message.content)d.type==="text"&&(a+=d.text);if(a=a.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g,"").trim(),a){s=a;break}}}catch(o){E.debug("PARSER","Skipping malformed transcript line",{lineIndex:r},o);continue}return{userMessage:"",assistantMessage:s}}catch(e){return E.failure("WORKER","Failed to extract prior messages from transcript",{transcriptPath:n},e),{userMessage:"",assistantMessage:""}}}function Q(n,e,t,s){if(!e.showLastMessage||n.length===0)return{userMessage:"",assistantMessage:""};let r=n.find(d=>d.memory_session_id!==t);if(!r)return{userMessage:"",assistantMessage:""};let o=r.memory_session_id,i=Dt(s),a=Ne.default.join(y,"projects",i,`${o}.jsonl`);return Mt(a)}function Ae(n,e){let t=e[0]?.id;return n.map((s,r)=>{let o=r===0?null:e[r+1];return{...s,displayEpoch:o?o.created_at_epoch:s.created_at_epoch,displayTime:o?o.created_at:s.created_at,shouldShowLink:s.id!==t}})}function Z(n,e){let t=[...n.map(s=>({type:"observation",data:s})),...e.map(s=>({type:"summary",data:s}))];return t.sort((s,r)=>{let o=s.type==="observation"?s.data.created_at_epoch:s.data.displayEpoch,i=r.type==="observation"?r.data.created_at_epoch:r.data.displayEpoch;return o-i}),t}function Ce(n,e){return new Set(n.slice(0,e).map(t=>t.id))}function ye(){let n=new Date,e=n.toLocaleDateString("en-CA"),t=n.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=n.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function Le(n){return[`# [${n}] recent context, ${ye()}`,""]}function De(){return[`**Legend:** session-request | ${N.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji} ${t.id}`).join(" | ")}`,""]}function Me(){return["**Column Key**:","- **Read**: Tokens to read this observation (cost to learn it now)","- **Work**: Tokens spent on work that produced this record ( research, building, deciding)",""]}function ve(){return["**Context Index:** This semantic index (titles, types, files, tokens) is usually sufficient to understand past work.","","When you need implementation details, rationale, or debugging context:","- Fetch by ID: get_observations([IDs]) for observations visible in this index","- Search history: Use the mem-search skill for past decisions, bugs, and deeper research","- Trust this index over re-reading code for past decisions and learnings",""]}function Ue(n,e){let t=[];if(t.push("**Context Economics**:"),t.push(`- Loading: ${n.totalObservations} observations (${n.totalReadTokens.toLocaleString()} tokens to read)`),t.push(`- Work investment: ${n.totalDiscoveryTokens.toLocaleString()} tokens spent on research, building, and decisions`),n.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)){let s="- Your savings: ";e.showSavingsAmount&&e.showSavingsPercent?s+=`${n.savings.toLocaleString()} tokens (${n.savingsPercent}% reduction from reuse)`:e.showSavingsAmount?s+=`${n.savings.toLocaleString()} tokens`:s+=`${n.savingsPercent}% reduction from reuse`,t.push(s)}return t.push(""),t}function xe(n){return[`### ${n}`,""]}function ke(n){return[`**${n}**`,"| ID | Time | T | Title | Read | Work |","|----|------|---|-------|------|------|"]}function we(n,e,t){let s=n.title||"Untitled",r=N.getInstance().getTypeIcon(n.type),{readTokens:o,discoveryDisplay:i}=L(n,t),a=t.showReadTokens?`~${o}`:"",d=t.showWorkTokens?i:"";return`| #${n.id} | ${e||'"'} | ${r} | ${s} | ${a} | ${d} |`}function Fe(n,e,t,s){let r=[],o=n.title||"Untitled",i=N.getInstance().getTypeIcon(n.type),{readTokens:a,discoveryDisplay:d}=L(n,s);r.push(`**#${n.id}** ${e||'"'} ${i} **${o}**`),t&&(r.push(""),r.push(t),r.push(""));let c=[];return s.showReadTokens&&c.push(`Read: ~${a}`),s.showWorkTokens&&c.push(`Work: ${d}`),c.length>0&&r.push(c.join(", ")),r.push(""),r}function $e(n,e){let t=`${n.request||"Session started"} (${e})`;return[`**#S${n.id}** ${t}`,""]}function U(n,e){return e?[`**${n}**: ${e}`,""]:[]}function Pe(n){return n.assistantMessage?["","---","","**Previously**","",`A: ${n.assistantMessage}`,""]:[]}function Xe(n,e){return["",`Access ${Math.round(n/1e3)}k tokens of past research & decisions for just ${e.toLocaleString()}t. Use the claude-mem skill to access memories by ID.`]}function Ge(n){return`# [${n}] recent context, ${ye()}

No previous sessions found for this project yet.`}function je(){let n=new Date,e=n.toLocaleDateString("en-CA"),t=n.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=n.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function Be(n){return["",`${_.bright}${_.cyan}[${n}] recent context, ${je()}${_.reset}`,`${_.gray}${"\u2500".repeat(60)}${_.reset}`,""]}function He(){let e=N.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji} ${t.id}`).join(" | ");return[`${_.dim}Legend: session-request | ${e}${_.reset}`,""]}function We(){return[`${_.bright}Column Key${_.reset}`,`${_.dim}  Read: Tokens to read this observation (cost to learn it now)${_.reset}`,`${_.dim}  Work: Tokens spent on work that produced this record ( research, building, deciding)${_.reset}`,""]}function Ye(){return[`${_.dim}Context Index: This semantic index (titles, types, files, tokens) is usually sufficient to understand past work.${_.reset}`,"",`${_.dim}When you need implementation details, rationale, or debugging context:${_.reset}`,`${_.dim}  - Fetch by ID: get_observations([IDs]) for observations visible in this index${_.reset}`,`${_.dim}  - Search history: Use the mem-search skill for past decisions, bugs, and deeper research${_.reset}`,`${_.dim}  - Trust this index over re-reading code for past decisions and learnings${_.reset}`,""]}function Ve(n,e){let t=[];if(t.push(`${_.bright}${_.cyan}Context Economics${_.reset}`),t.push(`${_.dim}  Loading: ${n.totalObservations} observations (${n.totalReadTokens.toLocaleString()} tokens to read)${_.reset}`),t.push(`${_.dim}  Work investment: ${n.totalDiscoveryTokens.toLocaleString()} tokens spent on research, building, and decisions${_.reset}`),n.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)){let s="  Your savings: ";e.showSavingsAmount&&e.showSavingsPercent?s+=`${n.savings.toLocaleString()} tokens (${n.savingsPercent}% reduction from reuse)`:e.showSavingsAmount?s+=`${n.savings.toLocaleString()} tokens`:s+=`${n.savingsPercent}% reduction from reuse`,t.push(`${_.green}${s}${_.reset}`)}return t.push(""),t}function Ke(n){return[`${_.bright}${_.cyan}${n}${_.reset}`,""]}function qe(n){return[`${_.dim}${n}${_.reset}`]}function Je(n,e,t,s){let r=n.title||"Untitled",o=N.getInstance().getTypeIcon(n.type),{readTokens:i,discoveryTokens:a,workEmoji:d}=L(n,s),c=t?`${_.dim}${e}${_.reset}`:" ".repeat(e.length),p=s.showReadTokens&&i>0?`${_.dim}(~${i}t)${_.reset}`:"",l=s.showWorkTokens&&a>0?`${_.dim}(${d} ${a.toLocaleString()}t)${_.reset}`:"";return`  ${_.dim}#${n.id}${_.reset}  ${c}  ${o}  ${r} ${p} ${l}`}function ze(n,e,t,s,r){let o=[],i=n.title||"Untitled",a=N.getInstance().getTypeIcon(n.type),{readTokens:d,discoveryTokens:c,workEmoji:p}=L(n,r),l=t?`${_.dim}${e}${_.reset}`:" ".repeat(e.length),T=r.showReadTokens&&d>0?`${_.dim}(~${d}t)${_.reset}`:"",u=r.showWorkTokens&&c>0?`${_.dim}(${p} ${c.toLocaleString()}t)${_.reset}`:"";return o.push(`  ${_.dim}#${n.id}${_.reset}  ${l}  ${a}  ${_.bright}${i}${_.reset}`),s&&o.push(`    ${_.dim}${s}${_.reset}`),(T||u)&&o.push(`    ${T} ${u}`),o.push(""),o}function Qe(n,e){let t=`${n.request||"Session started"} (${e})`;return[`${_.yellow}#S${n.id}${_.reset} ${t}`,""]}function x(n,e,t){return e?[`${t}${n}:${_.reset} ${e}`,""]:[]}function Ze(n){return n.assistantMessage?["","---","",`${_.bright}${_.magenta}Previously${_.reset}`,"",`${_.dim}A: ${n.assistantMessage}${_.reset}`,""]:[]}function et(n,e){let t=Math.round(n/1e3);return["",`${_.dim}Access ${t}k tokens of past research & decisions for just ${e.toLocaleString()}t. Use the claude-mem skill to access memories by ID.${_.reset}`]}function tt(n){return`
${_.bright}${_.cyan}[${n}] recent context, ${je()}${_.reset}
${_.gray}${"\u2500".repeat(60)}${_.reset}

${_.dim}No previous sessions found for this project yet.${_.reset}
`}function st(n,e,t,s){let r=[];return s?r.push(...Be(n)):r.push(...Le(n)),s?r.push(...He()):r.push(...De()),s?r.push(...We()):r.push(...Me()),s?r.push(...Ye()):r.push(...ve()),P(t)&&(s?r.push(...Ve(e,t)):r.push(...Ue(e,t))),r}var ee=D(require("path"),1);function B(n){if(!n)return[];try{let e=JSON.parse(n);return Array.isArray(e)?e:[]}catch(e){return E.debug("PARSER","Failed to parse JSON array, using empty fallback",{preview:n?.substring(0,50)},e),[]}}function rt(n){return new Date(n).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:!0,timeZone:"UTC"})}function ot(n){return new Date(n).toLocaleString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0,timeZone:"UTC"})}function it(n){return new Date(n).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"})}function nt(n,e){return ee.default.isAbsolute(n)?ee.default.relative(e,n):n}function at(n,e,t){let s=B(n);if(s.length>0)return nt(s[0],e);if(t){let r=B(t);if(r.length>0)return nt(r[0],e)}return"General"}function vt(n){let e=new Map;for(let s of n){let r=s.type==="observation"?s.data.created_at:s.data.displayTime,o=it(r);e.has(o)||e.set(o,[]),e.get(o).push(s)}let t=Array.from(e.entries()).sort((s,r)=>{let o=new Date(s[0]).getTime(),i=new Date(r[0]).getTime();return o-i});return new Map(t)}function Ut(n,e){return e.fullObservationField==="narrative"?n.narrative:n.facts?B(n.facts).join(`
`):null}function xt(n,e,t,s,r,o){let i=[];o?i.push(...Ke(n)):i.push(...xe(n));let a=null,d="",c=!1;for(let p of e)if(p.type==="summary"){c&&(i.push(""),c=!1,a=null,d="");let l=p.data,T=rt(l.displayTime);o?i.push(...Qe(l,T)):i.push(...$e(l,T))}else{let l=p.data,T=at(l.files_modified,r,l.files_read),u=ot(l.created_at),S=u!==d,f=S?u:"";d=u;let m=t.has(l.id);if(T!==a&&(c&&i.push(""),o?i.push(...qe(T)):i.push(...ke(T)),a=T,c=!0),m){let g=Ut(l,s);o?i.push(...ze(l,u,S,g,s)):(c&&!o&&(i.push(""),c=!1),i.push(...Fe(l,f,g,s)),a=null)}else o?i.push(Je(l,u,S,s)):i.push(we(l,f,s))}return c&&i.push(""),i}function dt(n,e,t,s,r){let o=[],i=vt(n);for(let[a,d]of i)o.push(...xt(a,d,e,t,s,r));return o}function _t(n,e,t){return!(!n.showLastSummary||!e||!!!(e.investigated||e.learned||e.completed||e.next_steps)||t&&e.created_at_epoch<=t.created_at_epoch)}function ct(n,e){let t=[];return e?(t.push(...x("Investigated",n.investigated,_.blue)),t.push(...x("Learned",n.learned,_.yellow)),t.push(...x("Completed",n.completed,_.green)),t.push(...x("Next Steps",n.next_steps,_.magenta))):(t.push(...U("Investigated",n.investigated)),t.push(...U("Learned",n.learned)),t.push(...U("Completed",n.completed)),t.push(...U("Next Steps",n.next_steps))),t}function Et(n,e){return e?Ze(n):Pe(n)}function lt(n,e,t){return!P(e)||n.totalDiscoveryTokens<=0||n.savings<=0?[]:t?et(n.totalDiscoveryTokens,n.totalReadTokens):Xe(n.totalDiscoveryTokens,n.totalReadTokens)}var kt=pt.default.join((0,ut.homedir)(),".claude","plugins","marketplaces","thedotmack","plugin",".install-version");function wt(){try{return new F}catch(n){if(n.code==="ERR_DLOPEN_FAILED"){try{(0,mt.unlinkSync)(kt)}catch(e){E.debug("SYSTEM","Marker file cleanup failed (may not exist)",{},e)}return E.error("SYSTEM","Native module rebuild needed - restart Claude Code to auto-fix"),null}throw n}}function Ft(n,e){return e?tt(n):Ge(n)}function $t(n,e,t,s,r,o,i){let a=[],d=q(e);a.push(...st(n,d,s,i));let c=t.slice(0,s.sessionCount),p=Ae(c,t),l=Z(e,p),T=Ce(e,s.fullObservationCount);a.push(...dt(l,T,s,r,i));let u=t[0],S=e[0];_t(s,u,S)&&a.push(...ct(u,i));let f=Q(e,s,o,r);return a.push(...Et(f,i)),a.push(...lt(d,s,i)),a.join(`
`).trimEnd()}async function te(n,e=!1,t){let s=Y(t),r=n?.cwd??process.cwd(),o=he(r),i=n?.projects||[o],a=wt();if(!a)return"";try{let d=i.length>1?Re(a,i,s):J(a,o,s),c=i.length>1?Ie(a,i,s):z(a,o,s);return d.length===0&&c.length===0?Ft(o,e):$t(o,d,c,s,r,n?.session_id,e)}finally{a.close()}}0&&(module.exports={generateContext});
