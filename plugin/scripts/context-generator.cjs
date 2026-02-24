"use strict";var gt=Object.create;var k=Object.defineProperty;var St=Object.getOwnPropertyDescriptor;var bt=Object.getOwnPropertyNames;var ht=Object.getPrototypeOf,ft=Object.prototype.hasOwnProperty;var Nt=(r,e)=>{for(var t in e)k(r,t,{get:e[t],enumerable:!0})},se=(r,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of bt(e))!ft.call(r,n)&&n!==t&&k(r,n,{get:()=>e[n],enumerable:!(s=St(e,n))||s.enumerable});return r};var D=(r,e,t)=>(t=r!=null?gt(ht(r)):{},se(e||!r||!r.__esModule?k(t,"default",{value:r,enumerable:!0}):t,r)),Ot=r=>se(k({},"__esModule",{value:!0}),r);var Pt={};Nt(Pt,{generateContext:()=>te});module.exports=Ot(Pt);var lt=D(require("path"),1),mt=require("os"),ut=require("fs");var ge=require("bun:sqlite");var h=require("path"),de=require("os"),_e=require("fs");var ce=require("url");var I=require("fs"),w=require("path"),oe=require("os");var re="bugfix,feature,refactor,discovery,decision,change",ne="how-it-works,why-it-exists,what-changed,problem-solution,gotcha,pattern,trade-off";var C=class{static DEFAULTS={CLAUDE_MEM_MODEL:"claude-sonnet-4-5",CLAUDE_MEM_CONTEXT_OBSERVATIONS:"50",CLAUDE_MEM_WORKER_PORT:"37777",CLAUDE_MEM_WORKER_HOST:"127.0.0.1",CLAUDE_MEM_SKIP_TOOLS:"ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion",CLAUDE_MEM_PROVIDER:"claude",CLAUDE_MEM_CLAUDE_AUTH_METHOD:"cli",CLAUDE_MEM_GEMINI_API_KEY:"",CLAUDE_MEM_GEMINI_API_URL:"https://generativelanguage.googleapis.com/v1/models",CLAUDE_MEM_GEMINI_MODEL:"gemini-2.5-flash-lite",CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED:"true",CLAUDE_MEM_OPENROUTER_API_KEY:"",CLAUDE_MEM_OPENROUTER_MODEL:"xiaomi/mimo-v2-flash:free",CLAUDE_MEM_OPENROUTER_SITE_URL:"",CLAUDE_MEM_OPENROUTER_APP_NAME:"claude-mem",CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_OPENROUTER_MAX_TOKENS:"100000",CLAUDE_MEM_DASHSCOPE_API_KEY:"",CLAUDE_MEM_DASHSCOPE_MODEL:"qwen-plus",CLAUDE_MEM_DASHSCOPE_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_DASHSCOPE_MAX_TOKENS:"100000",CLAUDE_MEM_DATA_DIR:(0,w.join)((0,oe.homedir)(),".claude-mem"),CLAUDE_MEM_LOG_LEVEL:"INFO",CLAUDE_MEM_PYTHON_VERSION:"3.13",CLAUDE_CODE_PATH:"",CLAUDE_MEM_MODE:"code",CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT:"true",CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES:re,CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS:ne,CLAUDE_MEM_CONTEXT_FULL_COUNT:"0",CLAUDE_MEM_CONTEXT_FULL_FIELD:"narrative",CLAUDE_MEM_CONTEXT_SESSION_COUNT:"10",CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY:"true",CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE:"false",CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT:"true",CLAUDE_MEM_EMBEDDING_FUNCTION:"dashscope:text-embedding-v3:768",CLAUDE_MEM_BUDGET_ENABLED:"false",CLAUDE_MEM_BUDGET_PRESET:"claude-haiku",CLAUDE_MEM_BUDGET_DAILY_LIMIT:"1.00",CLAUDE_MEM_BUDGET_MONTHLY_LIMIT:"20.00",CLAUDE_MEM_BUDGET_CUSTOM_PRICING:"",CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED:"false",CLAUDE_MEM_MAX_CONCURRENT_AGENTS:"2",CLAUDE_MEM_EXCLUDED_PROJECTS:"",CLAUDE_MEM_FOLDER_MD_EXCLUDE:"[]",CLAUDE_MEM_CHROMA_ENABLED:"true",CLAUDE_MEM_CHROMA_MODE:"local",CLAUDE_MEM_CHROMA_HOST:"127.0.0.1",CLAUDE_MEM_CHROMA_PORT:"8000",CLAUDE_MEM_CHROMA_SSL:"false",CLAUDE_MEM_CHROMA_API_KEY:"",CLAUDE_MEM_CHROMA_TENANT:"default_tenant",CLAUDE_MEM_CHROMA_DATABASE:"default_database"};static getAllDefaults(){return{...this.DEFAULTS}}static get(e){return this.DEFAULTS[e]}static getInt(e){let t=this.get(e);return parseInt(t,10)}static getBool(e){let t=this.get(e);return t==="true"||t===!0}static applyEnvOverrides(e){let t={...e};for(let s of Object.keys(this.DEFAULTS))process.env[s]!==void 0&&(t[s]=process.env[s]);return t}static loadFromFile(e){try{if(!(0,I.existsSync)(e)){let i=this.getAllDefaults();try{let a=(0,w.dirname)(e);(0,I.existsSync)(a)||(0,I.mkdirSync)(a,{recursive:!0}),(0,I.writeFileSync)(e,JSON.stringify(i,null,2),"utf-8"),console.log("[SETTINGS] Created settings file with defaults:",e)}catch(a){console.warn("[SETTINGS] Failed to create settings file, using in-memory defaults:",e,a)}return this.applyEnvOverrides(i)}let t=(0,I.readFileSync)(e,"utf-8"),s=JSON.parse(t),n=s;if(s.env&&typeof s.env=="object"){n=s.env;try{(0,I.writeFileSync)(e,JSON.stringify(n,null,2),"utf-8"),console.log("[SETTINGS] Migrated settings file from nested to flat schema:",e)}catch(i){console.warn("[SETTINGS] Failed to auto-migrate settings file:",e,i)}}let o={...this.DEFAULTS};for(let i of Object.keys(this.DEFAULTS))n[i]!==void 0&&(o[i]=n[i]);return this.applyEnvOverrides(o)}catch(t){return console.warn("[SETTINGS] Failed to load settings, using defaults:",e,t),this.applyEnvOverrides(this.getAllDefaults())}}};var A=require("fs"),M=require("path"),ae=require("os"),H=(o=>(o[o.DEBUG=0]="DEBUG",o[o.INFO=1]="INFO",o[o.WARN=2]="WARN",o[o.ERROR=3]="ERROR",o[o.SILENT=4]="SILENT",o))(H||{}),ie=(0,M.join)((0,ae.homedir)(),".claude-mem");function Rt(r){return r.replace(/([\?&](?:key|token|api[_-]?key|apikey|secret|password|access[_-]?token)=)[^&\s"']+/gi,"$1***")}var W=class{level=null;useColor;logFilePath=null;logFileInitialized=!1;constructor(){this.useColor=process.stdout.isTTY??!1}ensureLogFileInitialized(){if(!this.logFileInitialized){this.logFileInitialized=!0;try{let e=(0,M.join)(ie,"logs");(0,A.existsSync)(e)||(0,A.mkdirSync)(e,{recursive:!0});let t=new Date().toISOString().split("T")[0];this.logFilePath=(0,M.join)(e,`claude-mem-${t}.log`)}catch(e){console.error("[LOGGER] Failed to initialize log file:",e),this.logFilePath=null}}}getLevel(){if(this.level===null)try{let e=(0,M.join)(ie,"settings.json");if((0,A.existsSync)(e)){let t=(0,A.readFileSync)(e,"utf-8"),n=(JSON.parse(t).CLAUDE_MEM_LOG_LEVEL||"INFO").toUpperCase();this.level=H[n]??1}else this.level=1}catch{this.level=1}return this.level}correlationId(e,t){return`obs-${e}-${t}`}sessionId(e){return`session-${e}`}formatData(e){if(e==null)return"";if(typeof e=="string")return e;if(typeof e=="number"||typeof e=="boolean")return e.toString();if(typeof e=="object"){if(e instanceof Error)return this.getLevel()===0?`${e.message}
${e.stack}`:e.message;if(Array.isArray(e))return`[${e.length} items]`;let t=Object.keys(e);return t.length===0?"{}":t.length<=3?JSON.stringify(e):`{${t.length} keys: ${t.slice(0,3).join(", ")}...}`}return String(e)}formatTool(e,t){if(!t)return e;let s=t;if(typeof t=="string")try{s=JSON.parse(t)}catch{s=t}if(e==="Bash"&&s.command)return`${e}(${s.command})`;if(s.file_path)return`${e}(${s.file_path})`;if(s.notebook_path)return`${e}(${s.notebook_path})`;if(e==="Glob"&&s.pattern)return`${e}(${s.pattern})`;if(e==="Grep"&&s.pattern)return`${e}(${s.pattern})`;if(s.url)return`${e}(${s.url})`;if(s.query)return`${e}(${s.query})`;if(e==="Task"){if(s.subagent_type)return`${e}(${s.subagent_type})`;if(s.description)return`${e}(${s.description})`}return e==="Skill"&&s.skill?`${e}(${s.skill})`:e==="LSP"&&s.operation?`${e}(${s.operation})`:e}formatTimestamp(e){let t=e.getFullYear(),s=String(e.getMonth()+1).padStart(2,"0"),n=String(e.getDate()).padStart(2,"0"),o=String(e.getHours()).padStart(2,"0"),i=String(e.getMinutes()).padStart(2,"0"),a=String(e.getSeconds()).padStart(2,"0"),d=String(e.getMilliseconds()).padStart(3,"0");return`${t}-${s}-${n} ${o}:${i}:${a}.${d}`}log(e,t,s,n,o){if(e<this.getLevel())return;this.ensureLogFileInitialized();let i=this.formatTimestamp(new Date),a=H[e].padEnd(5),d=t.padEnd(6),E="";n?.correlationId?E=`[${n.correlationId}] `:n?.sessionId&&(E=`[session-${n.sessionId}] `);let p="";o!=null&&(o instanceof Error?p=this.getLevel()===0?`
${o.message}
${o.stack}`:` ${o.message}`:this.getLevel()===0&&typeof o=="object"?p=`
`+JSON.stringify(o,null,2):p=" "+this.formatData(o));let l="";if(n){let{sessionId:g,memorySessionId:f,correlationId:u,...S}=n;Object.keys(S).length>0&&(l=` {${Object.entries(S).map(([O,Tt])=>`${O}=${Tt}`).join(", ")}}`)}let T=`[${i}] [${a}] [${d}] ${E}${s}${l}${p}`,m=Rt(T);if(this.logFilePath)try{(0,A.appendFileSync)(this.logFilePath,m+`
`,"utf8")}catch(g){process.stderr.write(`[LOGGER] Failed to write to log file: ${g}
`)}else process.stderr.write(m+`
`)}debug(e,t,s,n){this.log(0,e,t,s,n)}info(e,t,s,n){this.log(1,e,t,s,n)}warn(e,t,s,n){this.log(2,e,t,s,n)}error(e,t,s,n){this.log(3,e,t,s,n)}dataIn(e,t,s,n){this.info(e,`\u2192 ${t}`,s,n)}dataOut(e,t,s,n){this.info(e,`\u2190 ${t}`,s,n)}success(e,t,s,n){this.info(e,`\u2713 ${t}`,s,n)}failure(e,t,s,n){this.error(e,`\u2717 ${t}`,s,n)}timing(e,t,s,n){this.info(e,`\u23F1 ${t}`,n,{duration:`${s}ms`})}happyPathError(e,t,s,n,o=""){let E=((new Error().stack||"").split(`
`)[2]||"").match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/),p=E?`${E[1].split("/").pop()}:${E[2]}`:"unknown",l={...s,location:p};return this.warn(e,`[HAPPY-PATH] ${t}`,l,n),o}},c=new W;var Ct={};function It(){return typeof __dirname<"u"?__dirname:(0,h.dirname)((0,ce.fileURLToPath)(Ct.url))}var At=It(),R=C.get("CLAUDE_MEM_DATA_DIR"),y=process.env.CLAUDE_CONFIG_DIR||(0,h.join)((0,de.homedir)(),".claude"),qt=(0,h.join)(y,"plugins","marketplaces","thedotmack"),Jt=(0,h.join)(R,"archives"),Qt=(0,h.join)(R,"logs"),zt=(0,h.join)(R,"trash"),Zt=(0,h.join)(R,"backups"),es=(0,h.join)(R,"modes"),ts=(0,h.join)(R,"settings.json"),Ee=(0,h.join)(R,"claude-mem.db"),ss=(0,h.join)(R,"vector-db"),rs=(0,h.join)(R,"observer-sessions"),ns=(0,h.join)(y,"settings.json"),os=(0,h.join)(y,"commands"),is=(0,h.join)(y,"CLAUDE.md");function pe(r){(0,_e.mkdirSync)(r,{recursive:!0})}function le(){return(0,h.join)(At,"..")}var me=require("crypto");var yt=3e4;function ue(r,e,t){return(0,me.createHash)("sha256").update((r||"")+(e||"")+(t||"")).digest("hex").slice(0,16)}function Te(r,e,t){let s=t-yt;return r.prepare("SELECT id, created_at_epoch FROM observations WHERE content_hash = ? AND created_at_epoch > ?").get(e,s)}var F=class{db;constructor(e=Ee){e!==":memory:"&&pe(R),this.db=new ge.Database(e),this.db.run("PRAGMA journal_mode = WAL"),this.db.run("PRAGMA synchronous = NORMAL"),this.db.run("PRAGMA foreign_keys = ON"),this.initializeSchema(),this.ensureWorkerPortColumn(),this.ensurePromptTrackingColumns(),this.removeSessionSummariesUniqueConstraint(),this.addObservationHierarchicalFields(),this.makeObservationsTextNullable(),this.createUserPromptsTable(),this.ensureDiscoveryTokensColumn(),this.createAIAnalysisTable(),this.createPendingMessagesTable(),this.renameSessionIdColumns(),this.repairSessionIdColumnRename(),this.addFailedAtEpochColumn(),this.addOnUpdateCascadeToForeignKeys(),this.addObservationContentHashColumn(),this.addSessionCustomTitleColumn(),this.createBudgetTables()}initializeSchema(){this.db.run(`
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
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(4,new Date().toISOString())}ensureWorkerPortColumn(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(s=>s.name==="worker_port")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN worker_port INTEGER"),c.debug("DB","Added worker_port column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(5,new Date().toISOString())}ensurePromptTrackingColumns(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(a=>a.name==="prompt_counter")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN prompt_counter INTEGER DEFAULT 0"),c.debug("DB","Added prompt_counter column to sdk_sessions table")),this.db.query("PRAGMA table_info(observations)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE observations ADD COLUMN prompt_number INTEGER"),c.debug("DB","Added prompt_number column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN prompt_number INTEGER"),c.debug("DB","Added prompt_number column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(6,new Date().toISOString())}removeSessionSummariesUniqueConstraint(){if(!this.db.query("PRAGMA index_list(session_summaries)").all().some(s=>s.unique===1)){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString());return}c.debug("DB","Removing UNIQUE constraint from session_summaries.memory_session_id");try{this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS session_summaries_new"),this.db.run(`
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
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString()),this.db.run("COMMIT")}catch(s){try{this.db.run("ROLLBACK")}catch{}throw s}c.debug("DB","Successfully removed UNIQUE constraint from session_summaries.memory_session_id")}addObservationHierarchicalFields(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(8))return;if(this.db.query("PRAGMA table_info(observations)").all().some(n=>n.name==="title")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString());return}c.debug("DB","Adding hierarchical fields to observations table"),this.db.run(`
      ALTER TABLE observations ADD COLUMN title TEXT;
      ALTER TABLE observations ADD COLUMN subtitle TEXT;
      ALTER TABLE observations ADD COLUMN facts TEXT;
      ALTER TABLE observations ADD COLUMN narrative TEXT;
      ALTER TABLE observations ADD COLUMN concepts TEXT;
      ALTER TABLE observations ADD COLUMN files_read TEXT;
      ALTER TABLE observations ADD COLUMN files_modified TEXT;
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString()),c.debug("DB","Successfully added hierarchical fields to observations table")}makeObservationsTextNullable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(9))return;let s=this.db.query("PRAGMA table_info(observations)").all().find(n=>n.name==="text");if(!s||s.notnull===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString());return}c.debug("DB","Making observations.text nullable");try{this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS observations_new"),this.db.run(`
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
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString()),this.db.run("COMMIT")}catch(n){try{this.db.run("ROLLBACK")}catch{}throw n}c.debug("DB","Successfully made observations.text nullable")}createUserPromptsTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(10))return;if(this.db.query("PRAGMA table_info(user_prompts)").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString());return}c.debug("DB","Creating user_prompts table with FTS5 support"),this.db.run("BEGIN TRANSACTION"),this.db.run(`
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
      `)}catch(s){c.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},s)}this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),c.debug("DB","Successfully created user_prompts table")}ensureDiscoveryTokensColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(11))return;this.db.query("PRAGMA table_info(observations)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),c.debug("DB","Added discovery_tokens column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),c.debug("DB","Added discovery_tokens column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(11,new Date().toISOString())}createAIAnalysisTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(12))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_analysis'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(12,new Date().toISOString());return}c.debug("DB","Creating ai_analysis table with FTS5 support"),this.db.run("BEGIN TRANSACTION");try{this.db.run(`
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
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(12,new Date().toISOString()),this.db.run("COMMIT")}catch(s){throw this.db.run("ROLLBACK"),s}c.debug("DB","Successfully created ai_analysis table with FTS5 support")}createPendingMessagesTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(16))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString());return}c.debug("DB","Creating pending_messages table"),this.db.run(`
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
    `),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_session ON pending_messages(session_db_id)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_status ON pending_messages(status)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_claude_session ON pending_messages(content_session_id)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString()),c.debug("DB","pending_messages table created successfully")}renameSessionIdColumns(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(17))return;c.debug("DB","Checking session ID columns for semantic clarity rename");let t=0,s=(n,o,i)=>{let a=this.db.query(`PRAGMA table_info(${n})`).all(),d=a.some(p=>p.name===o);return a.some(p=>p.name===i)?!1:d?(this.db.run(`ALTER TABLE ${n} RENAME COLUMN ${o} TO ${i}`),c.debug("DB",`Renamed ${n}.${o} to ${i}`),!0):(c.warn("DB",`Column ${o} not found in ${n}, skipping rename`),!1)};s("sdk_sessions","claude_session_id","content_session_id")&&t++,s("sdk_sessions","sdk_session_id","memory_session_id")&&t++,s("pending_messages","claude_session_id","content_session_id")&&t++,s("observations","sdk_session_id","memory_session_id")&&t++,s("session_summaries","sdk_session_id","memory_session_id")&&t++,s("user_prompts","claude_session_id","content_session_id")&&t++,this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(17,new Date().toISOString()),t>0?c.debug("DB",`Successfully renamed ${t} session ID columns`):c.debug("DB","No session ID column renames needed (already up to date)")}repairSessionIdColumnRename(){this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(19)||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(19,new Date().toISOString())}addFailedAtEpochColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(20))return;this.db.query("PRAGMA table_info(pending_messages)").all().some(n=>n.name==="failed_at_epoch")||(this.db.run("ALTER TABLE pending_messages ADD COLUMN failed_at_epoch INTEGER"),c.debug("DB","Added failed_at_epoch column to pending_messages table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(20,new Date().toISOString())}createBudgetTables(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(24))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='budget_state'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(24,new Date().toISOString());return}c.debug("DB","Creating budget tracking tables"),this.db.run("BEGIN TRANSACTION");try{this.db.run(`
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
      `);let s=new Date,n=`${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,"0")}-${String(s.getDate()).padStart(2,"0")}`,o=n.substring(0,7);this.db.prepare(`
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
      `).run(n,o,Date.now()),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(24,new Date().toISOString()),this.db.run("COMMIT")}catch(s){throw this.db.run("ROLLBACK"),s}c.debug("DB","Successfully created budget tracking tables")}addOnUpdateCascadeToForeignKeys(){if(!this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(21)){c.debug("DB","Adding ON UPDATE CASCADE to FK constraints on observations and session_summaries"),this.db.run("PRAGMA foreign_keys = OFF"),this.db.run("BEGIN TRANSACTION");try{this.db.run("DROP TRIGGER IF EXISTS observations_ai"),this.db.run("DROP TRIGGER IF EXISTS observations_ad"),this.db.run("DROP TRIGGER IF EXISTS observations_au"),this.db.run("DROP TABLE IF EXISTS observations_new"),this.db.run(`
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
          FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
        )
      `),this.db.run(`
        INSERT INTO observations_new
        SELECT id, memory_session_id, project, text, type, title, subtitle, facts,
               narrative, concepts, files_read, files_modified, prompt_number,
               discovery_tokens, created_at, created_at_epoch
        FROM observations
      `),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(`
        CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
        CREATE INDEX idx_observations_project ON observations(project);
        CREATE INDEX idx_observations_type ON observations(type);
        CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
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
        `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(21,new Date().toISOString()),this.db.run("COMMIT"),this.db.run("PRAGMA foreign_keys = ON"),c.debug("DB","Successfully added ON UPDATE CASCADE to FK constraints")}catch(t){throw this.db.run("ROLLBACK"),this.db.run("PRAGMA foreign_keys = ON"),t}}}addObservationContentHashColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(22))return;this.db.query("PRAGMA table_info(observations)").all().some(n=>n.name==="content_hash")||(this.db.run("ALTER TABLE observations ADD COLUMN content_hash TEXT"),this.db.run("UPDATE observations SET content_hash = substr(hex(randomblob(8)), 1, 16) WHERE content_hash IS NULL"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_content_hash ON observations(content_hash, created_at_epoch)"),c.debug("DB","Added content_hash column to observations table with backfill and index")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString())}addSessionCustomTitleColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(23))return;this.db.query("PRAGMA table_info(sdk_sessions)").all().some(n=>n.name==="custom_title")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN custom_title TEXT"),c.debug("DB","Added custom_title column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(23,new Date().toISOString())}updateMemorySessionId(e,t){this.db.prepare(`
      UPDATE sdk_sessions
      SET memory_session_id = ?
      WHERE id = ?
    `).run(t,e)}ensureMemorySessionIdRegistered(e,t){let s=this.db.prepare(`
      SELECT id, memory_session_id FROM sdk_sessions WHERE id = ?
    `).get(e);if(!s)throw new Error(`Session ${e} not found in sdk_sessions`);s.memory_session_id!==t&&(this.db.prepare(`
        UPDATE sdk_sessions SET memory_session_id = ? WHERE id = ?
      `).run(t,e),c.info("DB","Registered memory_session_id before storage (FK fix)",{sessionDbId:e,oldId:s.memory_session_id,newId:t}))}getRecentSummaries(e,t=10){return this.db.prepare(`
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
    `).get(e)||null}getObservationsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o,type:i,concepts:a,files:d}=t,E=s==="date_asc"?"ASC":"DESC",p=n?`LIMIT ${n}`:"",l=e.map(()=>"?").join(","),T=[...e],m=[];if(o&&(m.push("project = ?"),T.push(o)),i)if(Array.isArray(i)){let u=i.map(()=>"?").join(",");m.push(`type IN (${u})`),T.push(...i)}else m.push("type = ?"),T.push(i);if(a){let u=Array.isArray(a)?a:[a],S=u.map(()=>"EXISTS (SELECT 1 FROM json_each(concepts) WHERE value = ?)");T.push(...u),m.push(`(${S.join(" OR ")})`)}if(d){let u=Array.isArray(d)?d:[d],S=u.map(()=>"(EXISTS (SELECT 1 FROM json_each(files_read) WHERE value LIKE ?) OR EXISTS (SELECT 1 FROM json_each(files_modified) WHERE value LIKE ?))");u.forEach(b=>{T.push(`%${b}%`,`%${b}%`)}),m.push(`(${S.join(" OR ")})`)}let g=m.length>0?`WHERE id IN (${l}) AND ${m.join(" AND ")}`:`WHERE id IN (${l})`;return this.db.prepare(`
      SELECT *
      FROM observations
      ${g}
      ORDER BY created_at_epoch ${E}
      ${p}
    `).all(...T)}getSummaryForSession(e){return this.db.prepare(`
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
    `).all(e),n=new Set,o=new Set;for(let i of s){if(i.files_read){let a=JSON.parse(i.files_read);Array.isArray(a)&&a.forEach(d=>n.add(d))}if(i.files_modified){let a=JSON.parse(i.files_modified);Array.isArray(a)&&a.forEach(d=>o.add(d))}}return{filesRead:Array.from(n),filesModified:Array.from(o)}}getSessionById(e){return this.db.prepare(`
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
    `).get(e).count}createSDKSession(e,t,s,n){let o=new Date,i=o.getTime(),a=this.db.prepare(`
      SELECT id FROM sdk_sessions WHERE content_session_id = ?
    `).get(e);return a?(t&&this.db.prepare(`
          UPDATE sdk_sessions SET project = ?
          WHERE content_session_id = ? AND (project IS NULL OR project = '')
        `).run(t,e),n&&this.db.prepare(`
          UPDATE sdk_sessions SET custom_title = ?
          WHERE content_session_id = ? AND custom_title IS NULL
        `).run(n,e),a.id):(this.db.prepare(`
      INSERT INTO sdk_sessions
      (content_session_id, memory_session_id, project, user_prompt, custom_title, started_at, started_at_epoch, status)
      VALUES (?, NULL, ?, ?, ?, ?, ?, 'active')
    `).run(e,t,s,n||null,o.toISOString(),i),this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e).id)}saveUserPrompt(e,t,s){let n=new Date,o=n.getTime();return this.db.prepare(`
      INSERT INTO user_prompts
      (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `).run(e,t,s,n.toISOString(),o).lastInsertRowid}getUserPrompt(e,t){return this.db.prepare(`
      SELECT prompt_text
      FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
      LIMIT 1
    `).get(e,t)?.prompt_text??null}storeObservation(e,t,s,n,o=0,i){let a=i??Date.now(),d=new Date(a).toISOString(),E=ue(e,s.title,s.narrative),p=Te(this.db,E,a);if(p)return{id:p.id,createdAtEpoch:p.created_at_epoch};let T=this.db.prepare(`
      INSERT INTO observations
      (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
       files_read, files_modified, prompt_number, discovery_tokens, content_hash, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,t,s.type,s.title,s.subtitle,JSON.stringify(s.facts),s.narrative,JSON.stringify(s.concepts),JSON.stringify(s.files_read),JSON.stringify(s.files_modified),n||null,o,E,d,a);return{id:Number(T.lastInsertRowid),createdAtEpoch:a}}storeSummary(e,t,s,n,o=0,i){let a=i??Date.now(),d=new Date(a).toISOString(),p=this.db.prepare(`
      INSERT INTO session_summaries
      (memory_session_id, project, request, investigated, learned, completed,
       next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,t,s.request,s.investigated,s.learned,s.completed,s.next_steps,s.notes,n||null,o,d,a);return{id:Number(p.lastInsertRowid),createdAtEpoch:a}}storeObservations(e,t,s,n,o,i=0,a){let d=a??Date.now(),E=new Date(d).toISOString();return this.db.transaction(()=>{let l=[],T=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, created_at, created_at_epoch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);for(let g of s){let f=T.run(e,t,g.type,g.title,g.subtitle,JSON.stringify(g.facts),g.narrative,JSON.stringify(g.concepts),JSON.stringify(g.files_read),JSON.stringify(g.files_modified),o||null,i,E,d);l.push(Number(f.lastInsertRowid))}let m=null;if(n){let f=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,n.request,n.investigated,n.learned,n.completed,n.next_steps,n.notes,o||null,i,E,d);m=Number(f.lastInsertRowid)}return{observationIds:l,summaryId:m,createdAtEpoch:d}})()}storeObservationsAndMarkComplete(e,t,s,n,o,i,a,d=0,E){let p=E??Date.now(),l=new Date(p).toISOString();return this.db.transaction(()=>{let m=[],g=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, created_at, created_at_epoch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);for(let S of s){let b=g.run(e,t,S.type,S.title,S.subtitle,JSON.stringify(S.facts),S.narrative,JSON.stringify(S.concepts),JSON.stringify(S.files_read),JSON.stringify(S.files_modified),a||null,d,l,p);m.push(Number(b.lastInsertRowid))}let f;if(n){let b=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,n.request,n.investigated,n.learned,n.completed,n.next_steps,n.notes,a||null,d,l,p);f=Number(b.lastInsertRowid)}return this.db.prepare(`
        UPDATE pending_messages
        SET
          status = 'processed',
          completed_at_epoch = ?,
          tool_input = NULL,
          tool_response = NULL
        WHERE id = ? AND status = 'processing'
      `).run(p,o),{observationIds:m,summaryId:f,createdAtEpoch:p}})()}getSessionSummariesByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o}=t,i=s==="date_asc"?"ASC":"DESC",a=n?`LIMIT ${n}`:"",d=e.map(()=>"?").join(","),E=[...e],p=o?`WHERE id IN (${d}) AND project = ?`:`WHERE id IN (${d})`;return o&&E.push(o),this.db.prepare(`
      SELECT * FROM session_summaries
      ${p}
      ORDER BY created_at_epoch ${i}
      ${a}
    `).all(...E)}getUserPromptsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o}=t,i=s==="date_asc"?"ASC":"DESC",a=n?`LIMIT ${n}`:"",d=e.map(()=>"?").join(","),E=[...e],p=o?"AND s.project = ?":"";return o&&E.push(o),this.db.prepare(`
      SELECT
        up.*,
        s.project,
        s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.id IN (${d}) ${p}
      ORDER BY up.created_at_epoch ${i}
      ${a}
    `).all(...E)}getTimelineAroundTimestamp(e,t=10,s=10,n){return this.getTimelineAroundObservation(null,e,t,s,n)}getTimelineAroundObservation(e,t,s=10,n=10,o){let i=o?"AND project = ?":"",a=o?[o]:[],d,E;if(e!==null){let u=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id <= ? ${i}
        ORDER BY id DESC
        LIMIT ?
      `,S=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id >= ? ${i}
        ORDER BY id ASC
        LIMIT ?
      `;try{let b=this.db.prepare(u).all(e,...a,s+1),O=this.db.prepare(S).all(e,...a,n+1);if(b.length===0&&O.length===0)return{observations:[],sessions:[],prompts:[]};d=b.length>0?b[b.length-1].created_at_epoch:t,E=O.length>0?O[O.length-1].created_at_epoch:t}catch(b){return c.error("DB","Error getting boundary observations",void 0,{error:b,project:o}),{observations:[],sessions:[],prompts:[]}}}else{let u=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch <= ? ${i}
        ORDER BY created_at_epoch DESC
        LIMIT ?
      `,S=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch >= ? ${i}
        ORDER BY created_at_epoch ASC
        LIMIT ?
      `;try{let b=this.db.prepare(u).all(t,...a,s),O=this.db.prepare(S).all(t,...a,n+1);if(b.length===0&&O.length===0)return{observations:[],sessions:[],prompts:[]};d=b.length>0?b[b.length-1].created_at_epoch:t,E=O.length>0?O[O.length-1].created_at_epoch:t}catch(b){return c.error("DB","Error getting boundary timestamps",void 0,{error:b,project:o}),{observations:[],sessions:[],prompts:[]}}}let p=`
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
    `,m=this.db.prepare(p).all(d,E,...a),g=this.db.prepare(l).all(d,E,...a),f=this.db.prepare(T).all(d,E,...a);return{observations:m,sessions:g.map(u=>({id:u.id,memory_session_id:u.memory_session_id,project:u.project,request:u.request,completed:u.completed,next_steps:u.next_steps,created_at:u.created_at,created_at_epoch:u.created_at_epoch})),prompts:f.map(u=>({id:u.id,content_session_id:u.content_session_id,prompt_number:u.prompt_number,prompt_text:u.prompt_text,project:u.project,created_at:u.created_at,created_at_epoch:u.created_at_epoch}))}}getPromptById(e){return this.db.prepare(`
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
    `).run(t,s,e,o.toISOString(),o.getTime()),c.info("SESSION","Created manual session",{memorySessionId:t,project:e}),t}close(){this.db.close()}importSdkSession(e){let t=this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e.content_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
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
    `).run(e.content_session_id,e.prompt_number,e.prompt_text,e.created_at,e.created_at_epoch).lastInsertRowid}}storeAIAnalysis(e,t,s,n=[],o=[],i=[],a=0){let d=Date.now(),E=new Date(d).toISOString();return this.db.transaction(()=>{let T=this.db.prepare(`
        INSERT INTO ai_analysis
        (memory_session_id, project, analysis_text, key_insights, connections,
         discovery_tokens, created_at, created_at_epoch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(e,t,s,n.length>0?JSON.stringify(n):null,o.length>0?JSON.stringify(o):null,a,E,d),m=Number(T.lastInsertRowid);if(i.length>0){let g=this.db.prepare(`
          UPDATE observations
          SET ai_analysis_id = ?
          WHERE id = ?
        `);for(let f of i)g.run(m,f);c.info("DB","Linked observations to AI analysis",{analysisId:m,observationCount:i.length,project:t})}return{id:m,createdAtEpoch:d}})()}getAIAnalysisById(e){let s=this.db.prepare(`
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
    `).all(e).map(n=>n.id)}getExistingAnalysisForObservations(e){if(e.length===0)return null;let t=e.map(()=>"?").join(","),n=this.db.prepare(`
      SELECT DISTINCT ai_analysis_id
      FROM observations
      WHERE id IN (${t})
      AND ai_analysis_id IS NOT NULL
      LIMIT 1
    `).get(...e);return n?n.ai_analysis_id:null}searchAIAnalyses(e,t,s=10){return this.db.prepare(`
      SELECT a.*
      FROM ai_analysis a
      JOIN ai_analysis_fts fts ON a.id = fts.rowid
      WHERE ai_analysis_fts MATCH ?
      AND a.project = ?
      ORDER BY a.created_at_epoch DESC
      LIMIT ?
    `).all(e,t,s).map(i=>({id:i.id,memorySessionId:i.memory_session_id,project:i.project,analysisText:i.analysis_text,keyInsights:i.key_insights?JSON.parse(i.key_insights):[],connections:i.connections?JSON.parse(i.connections):[],createdAt:i.created_at,createdAtEpoch:i.created_at_epoch,discoveryTokens:i.discovery_tokens}))}};var Se=D(require("path"),1);function be(r){if(!r||r.trim()==="")return c.warn("PROJECT_NAME","Empty cwd provided, using fallback",{cwd:r}),"unknown-project";let e=Se.default.basename(r);if(e===""){if(process.platform==="win32"){let s=r.match(/^([A-Z]):\\/i);if(s){let o=`drive-${s[1].toUpperCase()}`;return c.info("PROJECT_NAME","Drive root detected",{cwd:r,projectName:o}),o}}return c.warn("PROJECT_NAME","Root directory detected, using fallback",{cwd:r}),"unknown-project"}return e}var he=D(require("path"),1),fe=require("os");var v=require("fs"),$=require("path");var N=class r{static instance=null;activeMode=null;modesDir;constructor(){let e=le(),t=[(0,$.join)(e,"modes"),(0,$.join)(e,"..","plugin","modes")],s=t.find(n=>(0,v.existsSync)(n));this.modesDir=s||t[0]}static getInstance(){return r.instance||(r.instance=new r),r.instance}parseInheritance(e){let t=e.split("--");if(t.length===1)return{hasParent:!1,parentId:"",overrideId:""};if(t.length>2)throw new Error(`Invalid mode inheritance: ${e}. Only one level of inheritance supported (parent--override)`);return{hasParent:!0,parentId:t[0],overrideId:e}}isPlainObject(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}deepMerge(e,t){let s={...e};for(let n in t){let o=t[n],i=e[n];this.isPlainObject(o)&&this.isPlainObject(i)?s[n]=this.deepMerge(i,o):s[n]=o}return s}loadModeFile(e){let t=(0,$.join)(this.modesDir,`${e}.json`);if(!(0,v.existsSync)(t))throw new Error(`Mode file not found: ${t}`);let s=(0,v.readFileSync)(t,"utf-8");return JSON.parse(s)}loadMode(e){let t=this.parseInheritance(e);if(!t.hasParent)try{let d=this.loadModeFile(e);return this.activeMode=d,c.debug("SYSTEM",`Loaded mode: ${d.name} (${e})`,void 0,{types:d.observation_types.map(E=>E.id),concepts:d.observation_concepts.map(E=>E.id)}),d}catch{if(c.warn("SYSTEM",`Mode file not found: ${e}, falling back to 'code'`),e==="code")throw new Error("Critical: code.json mode file missing");return this.loadMode("code")}let{parentId:s,overrideId:n}=t,o;try{o=this.loadMode(s)}catch{c.warn("SYSTEM",`Parent mode '${s}' not found for ${e}, falling back to 'code'`),o=this.loadMode("code")}let i;try{i=this.loadModeFile(n),c.debug("SYSTEM",`Loaded override file: ${n} for parent ${s}`)}catch{return c.warn("SYSTEM",`Override file '${n}' not found, using parent mode '${s}' only`),this.activeMode=o,o}if(!i)return c.warn("SYSTEM",`Invalid override file: ${n}, using parent mode '${s}' only`),this.activeMode=o,o;let a=this.deepMerge(o,i);return this.activeMode=a,c.debug("SYSTEM",`Loaded mode with inheritance: ${a.name} (${e} = ${s} + ${n})`,void 0,{parent:s,override:n,types:a.observation_types.map(d=>d.id),concepts:a.observation_concepts.map(d=>d.id)}),a}getActiveMode(){if(!this.activeMode)throw new Error("No mode loaded. Call loadMode() first.");return this.activeMode}getObservationTypes(){return this.getActiveMode().observation_types}getObservationConcepts(){return this.getActiveMode().observation_concepts}getTypeIcon(e){return this.getObservationTypes().find(s=>s.id===e)?.emoji||"\u{1F4DD}"}getWorkEmoji(e){return this.getObservationTypes().find(s=>s.id===e)?.work_emoji||"\u{1F4DD}"}validateType(e){return this.getObservationTypes().some(t=>t.id===e)}getTypeLabel(e){return this.getObservationTypes().find(s=>s.id===e)?.label||e}};function Y(){let r=he.default.join((0,fe.homedir)(),".claude-mem","settings.json"),e=C.loadFromFile(r),t=e.CLAUDE_MEM_MODE,s=t==="code"||t.startsWith("code--"),n,o;if(s)n=new Set(e.CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES.split(",").map(i=>i.trim()).filter(Boolean)),o=new Set(e.CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS.split(",").map(i=>i.trim()).filter(Boolean));else{let i=N.getInstance().getActiveMode();n=new Set(i.observation_types.map(a=>a.id)),o=new Set(i.observation_concepts.map(a=>a.id))}return{totalObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_OBSERVATIONS,10),fullObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_FULL_COUNT,10),sessionCount:parseInt(e.CLAUDE_MEM_CONTEXT_SESSION_COUNT,10),showReadTokens:e.CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS==="true",showWorkTokens:e.CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS==="true",showSavingsAmount:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT==="true",showSavingsPercent:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT==="true",observationTypes:n,observationConcepts:o,fullObservationField:e.CLAUDE_MEM_CONTEXT_FULL_FIELD,showLastSummary:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY==="true",showLastMessage:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE==="true"}}var _={reset:"\x1B[0m",bright:"\x1B[1m",dim:"\x1B[2m",cyan:"\x1B[36m",green:"\x1B[32m",yellow:"\x1B[33m",blue:"\x1B[34m",magenta:"\x1B[35m",gray:"\x1B[90m",red:"\x1B[31m"},Ne=4,V=1;function K(r){let e=(r.title?.length||0)+(r.subtitle?.length||0)+(r.narrative?.length||0)+JSON.stringify(r.facts||[]).length;return Math.ceil(e/Ne)}function q(r){let e=r.length,t=r.reduce((i,a)=>i+K(a),0),s=r.reduce((i,a)=>i+(a.discovery_tokens||0),0),n=s-t,o=s>0?Math.round(n/s*100):0;return{totalObservations:e,totalReadTokens:t,totalDiscoveryTokens:s,savings:n,savingsPercent:o}}function Lt(r){return N.getInstance().getWorkEmoji(r)}function L(r,e){let t=K(r),s=r.discovery_tokens||0,n=Lt(r.type),o=s>0?`${n} ${s.toLocaleString()}`:"-";return{readTokens:t,discoveryTokens:s,discoveryDisplay:o,workEmoji:n}}function P(r){return r.showReadTokens||r.showWorkTokens||r.showSavingsAmount||r.showSavingsPercent}var Oe=D(require("path"),1),X=require("fs");function J(r,e,t){let s=Array.from(t.observationTypes),n=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(",");return r.db.prepare(`
    SELECT
      id, memory_session_id, type, title, subtitle, narrative,
      facts, concepts, files_read, files_modified, discovery_tokens,
      created_at, created_at_epoch
    FROM observations
    WHERE project = ?
      AND type IN (${n})
      AND EXISTS (
        SELECT 1 FROM json_each(concepts)
        WHERE value IN (${i})
      )
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `).all(e,...s,...o,t.totalObservationCount)}function Q(r,e,t){return r.db.prepare(`
    SELECT id, memory_session_id, request, investigated, learned, completed, next_steps, created_at, created_at_epoch
    FROM session_summaries
    WHERE project = ?
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `).all(e,t.sessionCount+V)}function Re(r,e,t){let s=Array.from(t.observationTypes),n=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(","),a=e.map(()=>"?").join(",");return r.db.prepare(`
    SELECT
      id, memory_session_id, type, title, subtitle, narrative,
      facts, concepts, files_read, files_modified, discovery_tokens,
      created_at, created_at_epoch, project
    FROM observations
    WHERE project IN (${a})
      AND type IN (${n})
      AND EXISTS (
        SELECT 1 FROM json_each(concepts)
        WHERE value IN (${i})
      )
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `).all(...e,...s,...o,t.totalObservationCount)}function Ie(r,e,t){let s=e.map(()=>"?").join(",");return r.db.prepare(`
    SELECT id, memory_session_id, request, investigated, learned, completed, next_steps, created_at, created_at_epoch, project
    FROM session_summaries
    WHERE project IN (${s})
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `).all(...e,t.sessionCount+V)}function Dt(r){return r.replace(/\//g,"-")}function Mt(r){try{if(!(0,X.existsSync)(r))return{userMessage:"",assistantMessage:""};let e=(0,X.readFileSync)(r,"utf-8").trim();if(!e)return{userMessage:"",assistantMessage:""};let t=e.split(`
`).filter(n=>n.trim()),s="";for(let n=t.length-1;n>=0;n--)try{let o=t[n];if(!o.includes('"type":"assistant"'))continue;let i=JSON.parse(o);if(i.type==="assistant"&&i.message?.content&&Array.isArray(i.message.content)){let a="";for(let d of i.message.content)d.type==="text"&&(a+=d.text);if(a=a.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g,"").trim(),a){s=a;break}}}catch(o){c.debug("PARSER","Skipping malformed transcript line",{lineIndex:n},o);continue}return{userMessage:"",assistantMessage:s}}catch(e){return c.failure("WORKER","Failed to extract prior messages from transcript",{transcriptPath:r},e),{userMessage:"",assistantMessage:""}}}function z(r,e,t,s){if(!e.showLastMessage||r.length===0)return{userMessage:"",assistantMessage:""};let n=r.find(d=>d.memory_session_id!==t);if(!n)return{userMessage:"",assistantMessage:""};let o=n.memory_session_id,i=Dt(s),a=Oe.default.join(y,"projects",i,`${o}.jsonl`);return Mt(a)}function Ae(r,e){let t=e[0]?.id;return r.map((s,n)=>{let o=n===0?null:e[n+1];return{...s,displayEpoch:o?o.created_at_epoch:s.created_at_epoch,displayTime:o?o.created_at:s.created_at,shouldShowLink:s.id!==t}})}function Z(r,e){let t=[...r.map(s=>({type:"observation",data:s})),...e.map(s=>({type:"summary",data:s}))];return t.sort((s,n)=>{let o=s.type==="observation"?s.data.created_at_epoch:s.data.displayEpoch,i=n.type==="observation"?n.data.created_at_epoch:n.data.displayEpoch;return o-i}),t}function Ce(r,e){return new Set(r.slice(0,e).map(t=>t.id))}function ye(){let r=new Date,e=r.toLocaleDateString("en-CA"),t=r.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=r.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function Le(r){return[`# [${r}] recent context, ${ye()}`,""]}function De(){return[`**Legend:** session-request | ${N.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji} ${t.id}`).join(" | ")}`,""]}function Me(){return["**Column Key**:","- **Read**: Tokens to read this observation (cost to learn it now)","- **Work**: Tokens spent on work that produced this record ( research, building, deciding)",""]}function ve(){return["**Context Index:** This semantic index (titles, types, files, tokens) is usually sufficient to understand past work.","","When you need implementation details, rationale, or debugging context:","- Fetch by ID: get_observations([IDs]) for observations visible in this index","- Search history: Use the mem-search skill for past decisions, bugs, and deeper research","- Trust this index over re-reading code for past decisions and learnings",""]}function Ue(r,e){let t=[];if(t.push("**Context Economics**:"),t.push(`- Loading: ${r.totalObservations} observations (${r.totalReadTokens.toLocaleString()} tokens to read)`),t.push(`- Work investment: ${r.totalDiscoveryTokens.toLocaleString()} tokens spent on research, building, and decisions`),r.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)){let s="- Your savings: ";e.showSavingsAmount&&e.showSavingsPercent?s+=`${r.savings.toLocaleString()} tokens (${r.savingsPercent}% reduction from reuse)`:e.showSavingsAmount?s+=`${r.savings.toLocaleString()} tokens`:s+=`${r.savingsPercent}% reduction from reuse`,t.push(s)}return t.push(""),t}function xe(r){return[`### ${r}`,""]}function ke(r){return[`**${r}**`,"| ID | Time | T | Title | Read | Work |","|----|------|---|-------|------|------|"]}function we(r,e,t){let s=r.title||"Untitled",n=N.getInstance().getTypeIcon(r.type),{readTokens:o,discoveryDisplay:i}=L(r,t),a=t.showReadTokens?`~${o}`:"",d=t.showWorkTokens?i:"";return`| #${r.id} | ${e||'"'} | ${n} | ${s} | ${a} | ${d} |`}function Fe(r,e,t,s){let n=[],o=r.title||"Untitled",i=N.getInstance().getTypeIcon(r.type),{readTokens:a,discoveryDisplay:d}=L(r,s);n.push(`**#${r.id}** ${e||'"'} ${i} **${o}**`),t&&(n.push(""),n.push(t),n.push(""));let E=[];return s.showReadTokens&&E.push(`Read: ~${a}`),s.showWorkTokens&&E.push(`Work: ${d}`),E.length>0&&n.push(E.join(", ")),n.push(""),n}function $e(r,e){let t=`${r.request||"Session started"} (${e})`;return[`**#S${r.id}** ${t}`,""]}function U(r,e){return e?[`**${r}**: ${e}`,""]:[]}function Pe(r){return r.assistantMessage?["","---","","**Previously**","",`A: ${r.assistantMessage}`,""]:[]}function Xe(r,e){return["",`Access ${Math.round(r/1e3)}k tokens of past research & decisions for just ${e.toLocaleString()}t. Use the claude-mem skill to access memories by ID.`]}function Ge(r){return`# [${r}] recent context, ${ye()}

No previous sessions found for this project yet.`}function je(){let r=new Date,e=r.toLocaleDateString("en-CA"),t=r.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=r.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function Be(r){return["",`${_.bright}${_.cyan}[${r}] recent context, ${je()}${_.reset}`,`${_.gray}${"\u2500".repeat(60)}${_.reset}`,""]}function He(){let e=N.getInstance().getActiveMode().observation_types.map(t=>`${t.emoji} ${t.id}`).join(" | ");return[`${_.dim}Legend: session-request | ${e}${_.reset}`,""]}function We(){return[`${_.bright}Column Key${_.reset}`,`${_.dim}  Read: Tokens to read this observation (cost to learn it now)${_.reset}`,`${_.dim}  Work: Tokens spent on work that produced this record ( research, building, deciding)${_.reset}`,""]}function Ye(){return[`${_.dim}Context Index: This semantic index (titles, types, files, tokens) is usually sufficient to understand past work.${_.reset}`,"",`${_.dim}When you need implementation details, rationale, or debugging context:${_.reset}`,`${_.dim}  - Fetch by ID: get_observations([IDs]) for observations visible in this index${_.reset}`,`${_.dim}  - Search history: Use the mem-search skill for past decisions, bugs, and deeper research${_.reset}`,`${_.dim}  - Trust this index over re-reading code for past decisions and learnings${_.reset}`,""]}function Ve(r,e){let t=[];if(t.push(`${_.bright}${_.cyan}Context Economics${_.reset}`),t.push(`${_.dim}  Loading: ${r.totalObservations} observations (${r.totalReadTokens.toLocaleString()} tokens to read)${_.reset}`),t.push(`${_.dim}  Work investment: ${r.totalDiscoveryTokens.toLocaleString()} tokens spent on research, building, and decisions${_.reset}`),r.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)){let s="  Your savings: ";e.showSavingsAmount&&e.showSavingsPercent?s+=`${r.savings.toLocaleString()} tokens (${r.savingsPercent}% reduction from reuse)`:e.showSavingsAmount?s+=`${r.savings.toLocaleString()} tokens`:s+=`${r.savingsPercent}% reduction from reuse`,t.push(`${_.green}${s}${_.reset}`)}return t.push(""),t}function Ke(r){return[`${_.bright}${_.cyan}${r}${_.reset}`,""]}function qe(r){return[`${_.dim}${r}${_.reset}`]}function Je(r,e,t,s){let n=r.title||"Untitled",o=N.getInstance().getTypeIcon(r.type),{readTokens:i,discoveryTokens:a,workEmoji:d}=L(r,s),E=t?`${_.dim}${e}${_.reset}`:" ".repeat(e.length),p=s.showReadTokens&&i>0?`${_.dim}(~${i}t)${_.reset}`:"",l=s.showWorkTokens&&a>0?`${_.dim}(${d} ${a.toLocaleString()}t)${_.reset}`:"";return`  ${_.dim}#${r.id}${_.reset}  ${E}  ${o}  ${n} ${p} ${l}`}function Qe(r,e,t,s,n){let o=[],i=r.title||"Untitled",a=N.getInstance().getTypeIcon(r.type),{readTokens:d,discoveryTokens:E,workEmoji:p}=L(r,n),l=t?`${_.dim}${e}${_.reset}`:" ".repeat(e.length),T=n.showReadTokens&&d>0?`${_.dim}(~${d}t)${_.reset}`:"",m=n.showWorkTokens&&E>0?`${_.dim}(${p} ${E.toLocaleString()}t)${_.reset}`:"";return o.push(`  ${_.dim}#${r.id}${_.reset}  ${l}  ${a}  ${_.bright}${i}${_.reset}`),s&&o.push(`    ${_.dim}${s}${_.reset}`),(T||m)&&o.push(`    ${T} ${m}`),o.push(""),o}function ze(r,e){let t=`${r.request||"Session started"} (${e})`;return[`${_.yellow}#S${r.id}${_.reset} ${t}`,""]}function x(r,e,t){return e?[`${t}${r}:${_.reset} ${e}`,""]:[]}function Ze(r){return r.assistantMessage?["","---","",`${_.bright}${_.magenta}Previously${_.reset}`,"",`${_.dim}A: ${r.assistantMessage}${_.reset}`,""]:[]}function et(r,e){let t=Math.round(r/1e3);return["",`${_.dim}Access ${t}k tokens of past research & decisions for just ${e.toLocaleString()}t. Use the claude-mem skill to access memories by ID.${_.reset}`]}function tt(r){return`
${_.bright}${_.cyan}[${r}] recent context, ${je()}${_.reset}
${_.gray}${"\u2500".repeat(60)}${_.reset}

${_.dim}No previous sessions found for this project yet.${_.reset}
`}function st(r,e,t,s){let n=[];return s?n.push(...Be(r)):n.push(...Le(r)),s?n.push(...He()):n.push(...De()),s?n.push(...We()):n.push(...Me()),s?n.push(...Ye()):n.push(...ve()),P(t)&&(s?n.push(...Ve(e,t)):n.push(...Ue(e,t))),n}var ee=D(require("path"),1);function B(r){if(!r)return[];try{let e=JSON.parse(r);return Array.isArray(e)?e:[]}catch(e){return c.debug("PARSER","Failed to parse JSON array, using empty fallback",{preview:r?.substring(0,50)},e),[]}}function nt(r){return new Date(r).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:!0,timeZone:"UTC"})}function ot(r){return new Date(r).toLocaleString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0,timeZone:"UTC"})}function it(r){return new Date(r).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"})}function rt(r,e){return ee.default.isAbsolute(r)?ee.default.relative(e,r):r}function at(r,e,t){let s=B(r);if(s.length>0)return rt(s[0],e);if(t){let n=B(t);if(n.length>0)return rt(n[0],e)}return"General"}function vt(r){let e=new Map;for(let s of r){let n=s.type==="observation"?s.data.created_at:s.data.displayTime,o=it(n);e.has(o)||e.set(o,[]),e.get(o).push(s)}let t=Array.from(e.entries()).sort((s,n)=>{let o=new Date(s[0]).getTime(),i=new Date(n[0]).getTime();return o-i});return new Map(t)}function Ut(r,e){return e.fullObservationField==="narrative"?r.narrative:r.facts?B(r.facts).join(`
`):null}function xt(r,e,t,s,n,o){let i=[];o?i.push(...Ke(r)):i.push(...xe(r));let a=null,d="",E=!1;for(let p of e)if(p.type==="summary"){E&&(i.push(""),E=!1,a=null,d="");let l=p.data,T=nt(l.displayTime);o?i.push(...ze(l,T)):i.push(...$e(l,T))}else{let l=p.data,T=at(l.files_modified,n,l.files_read),m=ot(l.created_at),g=m!==d,f=g?m:"";d=m;let u=t.has(l.id);if(T!==a&&(E&&i.push(""),o?i.push(...qe(T)):i.push(...ke(T)),a=T,E=!0),u){let S=Ut(l,s);o?i.push(...Qe(l,m,g,S,s)):(E&&!o&&(i.push(""),E=!1),i.push(...Fe(l,f,S,s)),a=null)}else o?i.push(Je(l,m,g,s)):i.push(we(l,f,s))}return E&&i.push(""),i}function dt(r,e,t,s,n){let o=[],i=vt(r);for(let[a,d]of i)o.push(...xt(a,d,e,t,s,n));return o}function _t(r,e,t){return!(!r.showLastSummary||!e||!!!(e.investigated||e.learned||e.completed||e.next_steps)||t&&e.created_at_epoch<=t.created_at_epoch)}function ct(r,e){let t=[];return e?(t.push(...x("Investigated",r.investigated,_.blue)),t.push(...x("Learned",r.learned,_.yellow)),t.push(...x("Completed",r.completed,_.green)),t.push(...x("Next Steps",r.next_steps,_.magenta))):(t.push(...U("Investigated",r.investigated)),t.push(...U("Learned",r.learned)),t.push(...U("Completed",r.completed)),t.push(...U("Next Steps",r.next_steps))),t}function Et(r,e){return e?Ze(r):Pe(r)}function pt(r,e,t){return!P(e)||r.totalDiscoveryTokens<=0||r.savings<=0?[]:t?et(r.totalDiscoveryTokens,r.totalReadTokens):Xe(r.totalDiscoveryTokens,r.totalReadTokens)}var kt=lt.default.join((0,mt.homedir)(),".claude","plugins","marketplaces","thedotmack","plugin",".install-version");function wt(){try{return new F}catch(r){if(r.code==="ERR_DLOPEN_FAILED"){try{(0,ut.unlinkSync)(kt)}catch(e){c.debug("SYSTEM","Marker file cleanup failed (may not exist)",{},e)}return c.error("SYSTEM","Native module rebuild needed - restart Claude Code to auto-fix"),null}throw r}}function Ft(r,e){return e?tt(r):Ge(r)}function $t(r,e,t,s,n,o,i){let a=[],d=q(e);a.push(...st(r,d,s,i));let E=t.slice(0,s.sessionCount),p=Ae(E,t),l=Z(e,p),T=Ce(e,s.fullObservationCount);a.push(...dt(l,T,s,n,i));let m=t[0],g=e[0];_t(s,m,g)&&a.push(...ct(m,i));let f=z(e,s,o,n);return a.push(...Et(f,i)),a.push(...pt(d,s,i)),a.join(`
`).trimEnd()}async function te(r,e=!1){let t=Y(),s=r?.cwd??process.cwd(),n=be(s),o=r?.projects||[n],i=wt();if(!i)return"";try{let a=o.length>1?Re(i,o,t):J(i,n,t),d=o.length>1?Ie(i,o,t):Q(i,n,t);return a.length===0&&d.length===0?Ft(n,e):$t(n,a,d,t,s,r?.session_id,e)}finally{i.close()}}0&&(module.exports={generateContext});
