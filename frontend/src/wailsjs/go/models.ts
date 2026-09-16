export namespace agent {
	
	export class Attachment {
	    path: string;
	    caption?: string;
	
	    static createFrom(source: any = {}) {
	        return new Attachment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.caption = source["caption"];
	    }
	}

}

export namespace automation {
	
	export class Definition {
	    id: string;
	    name: string;
	    kind: string;
	    status: string;
	    cron: string;
	    prompt: string;
	    projectId?: string;
	    sessionId?: string;
	    createdAt: number;
	    updatedAt: number;
	    lastRunAt?: number;
	    nextRunAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new Definition(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.status = source["status"];
	        this.cron = source["cron"];
	        this.prompt = source["prompt"];
	        this.projectId = source["projectId"];
	        this.sessionId = source["sessionId"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.lastRunAt = source["lastRunAt"];
	        this.nextRunAt = source["nextRunAt"];
	    }
	}
	export class Run {
	    id: string;
	    automationId: string;
	    status: string;
	    trigger: string;
	    summary?: string;
	    error?: string;
	    sessionId?: string;
	    createdAt: number;
	    startedAt?: number;
	    completedAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new Run(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.automationId = source["automationId"];
	        this.status = source["status"];
	        this.trigger = source["trigger"];
	        this.summary = source["summary"];
	        this.error = source["error"];
	        this.sessionId = source["sessionId"];
	        this.createdAt = source["createdAt"];
	        this.startedAt = source["startedAt"];
	        this.completedAt = source["completedAt"];
	    }
	}

}

export namespace browser {
	
	export class Target {
	    id: string;
	    type: string;
	    title: string;
	    url: string;
	    webSocketDebuggerUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new Target(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.title = source["title"];
	        this.url = source["url"];
	        this.webSocketDebuggerUrl = source["webSocketDebuggerUrl"];
	    }
	}

}

export namespace calendar {
	
	export class Event {
	    id: string;
	    title: string;
	    description?: string;
	    startAt: number;
	    endAt?: number;
	    allDay?: boolean;
	    projectId?: string;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Event(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.startAt = source["startAt"];
	        this.endAt = source["endAt"];
	        this.allDay = source["allDay"];
	        this.projectId = source["projectId"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}

}

export namespace cinema {
	
	export class Asset {
	    id: string;
	    path: string;
	    kind: string;
	    name: string;
	    duration?: number;
	
	    static createFrom(source: any = {}) {
	        return new Asset(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.kind = source["kind"];
	        this.name = source["name"];
	        this.duration = source["duration"];
	    }
	}
	export class Clip {
	    id: string;
	    assetId: string;
	    start: number;
	    end: number;
	    offset: number;
	    label?: string;
	
	    static createFrom(source: any = {}) {
	        return new Clip(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.assetId = source["assetId"];
	        this.start = source["start"];
	        this.end = source["end"];
	        this.offset = source["offset"];
	        this.label = source["label"];
	    }
	}
	export class RenderJob {
	    id: string;
	    timelineId: string;
	    status: string;
	    outputPath?: string;
	    error?: string;
	    progress: number;
	    createdAt: number;
	    updatedAt: number;
	    startedAt?: number;
	    completedAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new RenderJob(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.timelineId = source["timelineId"];
	        this.status = source["status"];
	        this.outputPath = source["outputPath"];
	        this.error = source["error"];
	        this.progress = source["progress"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.startedAt = source["startedAt"];
	        this.completedAt = source["completedAt"];
	    }
	}
	export class Track {
	    id: string;
	    kind: string;
	    clips: Clip[];
	
	    static createFrom(source: any = {}) {
	        return new Track(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.clips = this.convertValues(source["clips"], Clip);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Timeline {
	    id: string;
	    name: string;
	    duration: number;
	    tracks: Track[];
	    assets: Asset[];
	    metadata?: Record<string, any>;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Timeline(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.duration = source["duration"];
	        this.tracks = this.convertValues(source["tracks"], Track);
	        this.assets = this.convertValues(source["assets"], Asset);
	        this.metadata = source["metadata"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace connector {
	
	export class Definition {
	    id: string;
	    name: string;
	    kind: string;
	    description?: string;
	    endpoint?: string;
	    command?: string;
	    headers?: Record<string, string>;
	    config?: Record<string, string>;
	    status: string;
	    lastError?: string;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Definition(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.description = source["description"];
	        this.endpoint = source["endpoint"];
	        this.command = source["command"];
	        this.headers = source["headers"];
	        this.config = source["config"];
	        this.status = source["status"];
	        this.lastError = source["lastError"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}

}

export namespace git {
	
	export class FileStatus {
	    Path: string;
	    Status: string;
	
	    static createFrom(source: any = {}) {
	        return new FileStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Path = source["Path"];
	        this.Status = source["Status"];
	    }
	}
	export class LogEntry {
	    Hash: string;
	    Author: string;
	    // Go type: time
	    When: any;
	    Message: string;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Hash = source["Hash"];
	        this.Author = source["Author"];
	        this.When = this.convertValues(source["When"], null);
	        this.Message = source["Message"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace llm {
	
	export class ProbeResult {
	    ok: boolean;
	    latencyMs: number;
	    endpoint?: string;
	    normalizedBaseUrl?: string;
	    models?: string[];
	    streamOk: boolean;
	    toolsOk: boolean;
	    visionOk: boolean;
	    error?: string;
	    details?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new ProbeResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.latencyMs = source["latencyMs"];
	        this.endpoint = source["endpoint"];
	        this.normalizedBaseUrl = source["normalizedBaseUrl"];
	        this.models = source["models"];
	        this.streamOk = source["streamOk"];
	        this.toolsOk = source["toolsOk"];
	        this.visionOk = source["visionOk"];
	        this.error = source["error"];
	        this.details = source["details"];
	    }
	}

}

export namespace lsp {
	
	export class Definition {
	    uri: string;
	    line: number;
	    col: number;
	
	    static createFrom(source: any = {}) {
	        return new Definition(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.line = source["line"];
	        this.col = source["col"];
	    }
	}
	export class Diagnostic {
	    range: string;
	    severity: string;
	    source: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new Diagnostic(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.range = source["range"];
	        this.severity = source["severity"];
	        this.source = source["source"];
	        this.message = source["message"];
	    }
	}
	export class ServerConfig {
	    ID: string;
	    Name: string;
	    Languages: string[];
	    Command: string;
	    Args: string[];
	
	    static createFrom(source: any = {}) {
	        return new ServerConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Name = source["Name"];
	        this.Languages = source["Languages"];
	        this.Command = source["Command"];
	        this.Args = source["Args"];
	    }
	}

}

export namespace main {
	
	export class FileEntry {
	    name: string;
	    path: string;
	    absPath: string;
	    isDirectory: boolean;
	    ext: string;
	
	    static createFrom(source: any = {}) {
	        return new FileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.absPath = source["absPath"];
	        this.isDirectory = source["isDirectory"];
	        this.ext = source["ext"];
	    }
	}

}

export namespace mcp {
	
	export class LocalStatus {
	    running: boolean;
	    host: string;
	    port: number;
	    url?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new LocalStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.url = source["url"];
	        this.error = source["error"];
	    }
	}

}

export namespace provider {
	
	export class CatalogItem {
	    id: string;
	    name: string;
	    protocol: string;
	    baseUrl: string;
	    models: string[];
	    defaultModel: string;
	    source: string;
	
	    static createFrom(source: any = {}) {
	        return new CatalogItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.protocol = source["protocol"];
	        this.baseUrl = source["baseUrl"];
	        this.models = source["models"];
	        this.defaultModel = source["defaultModel"];
	        this.source = source["source"];
	    }
	}

}

export namespace settingsops {
	
	export class BrowserStatus {
	    chromePath?: string;
	    profilePath: string;
	    sitePermissions: store.BrowserSitePermission[];
	
	    static createFrom(source: any = {}) {
	        return new BrowserStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.chromePath = source["chromePath"];
	        this.profilePath = source["profilePath"];
	        this.sitePermissions = this.convertValues(source["sitePermissions"], store.BrowserSitePermission);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ComputerUseStatus {
	    chromePath?: string;
	    allowlist: string[];
	
	    static createFrom(source: any = {}) {
	        return new ComputerUseStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.chromePath = source["chromePath"];
	        this.allowlist = source["allowlist"];
	    }
	}
	export class GitStatus {
	    available: boolean;
	    version?: string;
	    userName?: string;
	    userEmail?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new GitStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.version = source["version"];
	        this.userName = source["userName"];
	        this.userEmail = source["userEmail"];
	        this.error = source["error"];
	    }
	}
	export class ProjectEnvironmentStatus {
	    projectId: string;
	    name: string;
	    path: string;
	    exists: boolean;
	    git: GitStatus;
	    dependencies: store.DependencyCheckResult[];
	
	    static createFrom(source: any = {}) {
	        return new ProjectEnvironmentStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.projectId = source["projectId"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.exists = source["exists"];
	        this.git = this.convertValues(source["git"], GitStatus);
	        this.dependencies = this.convertValues(source["dependencies"], store.DependencyCheckResult);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace skill {
	
	export class Skill {
	    id: string;
	    name: string;
	    description?: string;
	    path: string;
	    source: string;
	    triggers?: string[];
	    allowedTools?: string[];
	    enabled: boolean;
	    builtin?: boolean;
	    updatedAt?: number;
	    body?: string;
	
	    static createFrom(source: any = {}) {
	        return new Skill(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.path = source["path"];
	        this.source = source["source"];
	        this.triggers = source["triggers"];
	        this.allowedTools = source["allowedTools"];
	        this.enabled = source["enabled"];
	        this.builtin = source["builtin"];
	        this.updatedAt = source["updatedAt"];
	        this.body = source["body"];
	    }
	}

}

export namespace store {
	
	export class AgentRuntimeParams {
	    maxSteps?: number;
	    compactThreshold?: number;
	    temperature?: number;
	    topP?: number;
	    maxTokens?: number;
	    seed?: number;
	
	    static createFrom(source: any = {}) {
	        return new AgentRuntimeParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.maxSteps = source["maxSteps"];
	        this.compactThreshold = source["compactThreshold"];
	        this.temperature = source["temperature"];
	        this.topP = source["topP"];
	        this.maxTokens = source["maxTokens"];
	        this.seed = source["seed"];
	    }
	}
	export class AppearanceSettings {
	    theme: string;
	    accent: string;
	    uiFontFamily: string;
	    codeFontFamily: string;
	    uiFontSize: number;
	    codeFontSize: number;
	    contrast: string;
	    reduceMotion: boolean;
	    pointerCursors: boolean;
	    diffMarkers: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AppearanceSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.accent = source["accent"];
	        this.uiFontFamily = source["uiFontFamily"];
	        this.codeFontFamily = source["codeFontFamily"];
	        this.uiFontSize = source["uiFontSize"];
	        this.codeFontSize = source["codeFontSize"];
	        this.contrast = source["contrast"];
	        this.reduceMotion = source["reduceMotion"];
	        this.pointerCursors = source["pointerCursors"];
	        this.diffMarkers = source["diffMarkers"];
	    }
	}
	export class BrowserSettings {
	    enabled: boolean;
	    openTarget: string;
	    screenshots: string;
	    downloads: string;
	    permissions: Record<string, string>;
	    developerMode: boolean;
	    fullCdpAccess: boolean;
	
	    static createFrom(source: any = {}) {
	        return new BrowserSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.openTarget = source["openTarget"];
	        this.screenshots = source["screenshots"];
	        this.downloads = source["downloads"];
	        this.permissions = source["permissions"];
	        this.developerMode = source["developerMode"];
	        this.fullCdpAccess = source["fullCdpAccess"];
	    }
	}
	export class BrowserSitePermission {
	    origin: string;
	    permission: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new BrowserSitePermission(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.origin = source["origin"];
	        this.permission = source["permission"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class ComputerUseSettings {
	    anyApp: boolean;
	    allowlist: string[];
	
	    static createFrom(source: any = {}) {
	        return new ComputerUseSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.anyApp = source["anyApp"];
	        this.allowlist = source["allowlist"];
	    }
	}
	export class DependencyCheckResult {
	    id: string;
	    name: string;
	    command: string;
	    path?: string;
	    version?: string;
	    status: string;
	    detail?: string;
	    checkedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new DependencyCheckResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.command = source["command"];
	        this.path = source["path"];
	        this.version = source["version"];
	        this.status = source["status"];
	        this.detail = source["detail"];
	        this.checkedAt = source["checkedAt"];
	    }
	}
	export class EnvironmentSettings {
	    projects: string[];
	
	    static createFrom(source: any = {}) {
	        return new EnvironmentSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.projects = source["projects"];
	    }
	}
	export class GitRepoEntry {
	    id: string;
	    projectId?: string;
	    path: string;
	    branch?: string;
	    remote?: string;
	    addedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new GitRepoEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.path = source["path"];
	        this.branch = source["branch"];
	        this.remote = source["remote"];
	        this.addedAt = source["addedAt"];
	    }
	}
	export class GitSettings {
	    branchPrefix: string;
	    mergeMethod: string;
	    forcePush: boolean;
	    draftPR: boolean;
	    reviewDelivery: string;
	    commitInstructions: string;
	
	    static createFrom(source: any = {}) {
	        return new GitSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.branchPrefix = source["branchPrefix"];
	        this.mergeMethod = source["mergeMethod"];
	        this.forcePush = source["forcePush"];
	        this.draftPR = source["draftPR"];
	        this.reviewDelivery = source["reviewDelivery"];
	        this.commitInstructions = source["commitInstructions"];
	    }
	}
	export class HookEntry {
	    id: string;
	    name: string;
	    event: string;
	    tool?: string;
	    command: string;
	    cwd?: string;
	    enabled: boolean;
	    lastRun?: number;
	    lastError?: string;
	
	    static createFrom(source: any = {}) {
	        return new HookEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.event = source["event"];
	        this.tool = source["tool"];
	        this.command = source["command"];
	        this.cwd = source["cwd"];
	        this.enabled = source["enabled"];
	        this.lastRun = source["lastRun"];
	        this.lastError = source["lastError"];
	    }
	}
	export class LSPServerEntry {
	    id: string;
	    name: string;
	    languages: string[];
	    command: string;
	    args?: string[];
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LSPServerEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.languages = source["languages"];
	        this.command = source["command"];
	        this.args = source["args"];
	        this.enabled = source["enabled"];
	    }
	}
	export class MCPToolPolicyEntry {
	    policy: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPToolPolicyEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.policy = source["policy"];
	    }
	}
	export class MCPServerEntry {
	    id: string;
	    name: string;
	    transport: string;
	    command?: string;
	    args?: string[];
	    cwd?: string;
	    env?: Record<string, string>;
	    serverUrl?: string;
	    headers?: Record<string, string>;
	    authorization?: string;
	    hasAuthorization?: boolean;
	    timeoutMs?: number;
	    enabled: boolean;
	    status: string;
	    lastError?: string;
	    tools?: string[];
	    toolPolicies?: Record<string, MCPToolPolicyEntry>;
	
	    static createFrom(source: any = {}) {
	        return new MCPServerEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.transport = source["transport"];
	        this.command = source["command"];
	        this.args = source["args"];
	        this.cwd = source["cwd"];
	        this.env = source["env"];
	        this.serverUrl = source["serverUrl"];
	        this.headers = source["headers"];
	        this.authorization = source["authorization"];
	        this.hasAuthorization = source["hasAuthorization"];
	        this.timeoutMs = source["timeoutMs"];
	        this.enabled = source["enabled"];
	        this.status = source["status"];
	        this.lastError = source["lastError"];
	        this.tools = source["tools"];
	        this.toolPolicies = this.convertValues(source["toolPolicies"], MCPToolPolicyEntry, true);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class MemoryItem {
	    id: string;
	    text: string;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new MemoryItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.text = source["text"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class MessagePart {
	    type: string;
	    text?: string;
	    tool?: string;
	    callId?: string;
	    args?: string;
	    result?: string;
	    path?: string;
	    diff?: string;
	    status?: string;
	    approveId?: string;
	
	    static createFrom(source: any = {}) {
	        return new MessagePart(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.text = source["text"];
	        this.tool = source["tool"];
	        this.callId = source["callId"];
	        this.args = source["args"];
	        this.result = source["result"];
	        this.path = source["path"];
	        this.diff = source["diff"];
	        this.status = source["status"];
	        this.approveId = source["approveId"];
	    }
	}
	export class Message {
	    id: string;
	    role: string;
	    parts: MessagePart[];
	    createdAt: number;
	    durationMs?: number;
	    model?: string;
	    source?: string;
	    tokensIn?: number;
	    tokensOut?: number;
	
	    static createFrom(source: any = {}) {
	        return new Message(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.role = source["role"];
	        this.parts = this.convertValues(source["parts"], MessagePart);
	        this.createdAt = source["createdAt"];
	        this.durationMs = source["durationMs"];
	        this.model = source["model"];
	        this.source = source["source"];
	        this.tokensIn = source["tokensIn"];
	        this.tokensOut = source["tokensOut"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class NotificationEvent {
	    id: string;
	    title: string;
	    body: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new NotificationEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.body = source["body"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class PersonalizationSettings {
	    personality: string;
	    customInstructions: string;
	    memoryEnabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PersonalizationSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.personality = source["personality"];
	        this.customInstructions = source["customInstructions"];
	        this.memoryEnabled = source["memoryEnabled"];
	    }
	}
	export class Pet {
	    id: string;
	    name: string;
	    selected: boolean;
	    desc: string;
	    thumb: string;
	
	    static createFrom(source: any = {}) {
	        return new Pet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.selected = source["selected"];
	        this.desc = source["desc"];
	        this.thumb = source["thumb"];
	    }
	}
	export class PetSettings {
	    selected: string;
	    directory: string;
	    size: number;
	    asleep: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PetSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.selected = source["selected"];
	        this.directory = source["directory"];
	        this.size = source["size"];
	        this.asleep = source["asleep"];
	    }
	}
	export class PluginEntry {
	    id: string;
	    name: string;
	    desc: string;
	    installed: boolean;
	    enabled: boolean;
	    tag: string;
	    logoLetter: string;
	    source?: string;
	    version?: string;
	    manifest?: string;
	    diagnostics?: string;
	    mcpServers?: string[];
	    skills?: string[];
	
	    static createFrom(source: any = {}) {
	        return new PluginEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.desc = source["desc"];
	        this.installed = source["installed"];
	        this.enabled = source["enabled"];
	        this.tag = source["tag"];
	        this.logoLetter = source["logoLetter"];
	        this.source = source["source"];
	        this.version = source["version"];
	        this.manifest = source["manifest"];
	        this.diagnostics = source["diagnostics"];
	        this.mcpServers = source["mcpServers"];
	        this.skills = source["skills"];
	    }
	}
	export class WorktreeSettings {
	    root: string;
	    autoCleanup: boolean;
	    retention: number;
	
	    static createFrom(source: any = {}) {
	        return new WorktreeSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.root = source["root"];
	        this.autoCleanup = source["autoCleanup"];
	        this.retention = source["retention"];
	    }
	}
	export class VoiceSettings {
	    tts: boolean;
	    hotkey: string;
	    keepBar: boolean;
	    dictionary: string;
	    microphone: string;
	    recent: string[];
	
	    static createFrom(source: any = {}) {
	        return new VoiceSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tts = source["tts"];
	        this.hotkey = source["hotkey"];
	        this.keepBar = source["keepBar"];
	        this.dictionary = source["dictionary"];
	        this.microphone = source["microphone"];
	        this.recent = source["recent"];
	    }
	}
	export class Preferences {
	    appearance: AppearanceSettings;
	    voice: VoiceSettings;
	    personalization: PersonalizationSettings;
	    pets: PetSettings;
	    browser: BrowserSettings;
	    computerUse: ComputerUseSettings;
	    git: GitSettings;
	    environments: EnvironmentSettings;
	    worktrees: WorktreeSettings;
	
	    static createFrom(source: any = {}) {
	        return new Preferences(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.appearance = this.convertValues(source["appearance"], AppearanceSettings);
	        this.voice = this.convertValues(source["voice"], VoiceSettings);
	        this.personalization = this.convertValues(source["personalization"], PersonalizationSettings);
	        this.pets = this.convertValues(source["pets"], PetSettings);
	        this.browser = this.convertValues(source["browser"], BrowserSettings);
	        this.computerUse = this.convertValues(source["computerUse"], ComputerUseSettings);
	        this.git = this.convertValues(source["git"], GitSettings);
	        this.environments = this.convertValues(source["environments"], EnvironmentSettings);
	        this.worktrees = this.convertValues(source["worktrees"], WorktreeSettings);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Project {
	    id: string;
	    name: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new Project(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	    }
	}
	export class Provider {
	    id: string;
	    name: string;
	    baseUrl: string;
	    apiKey?: string;
	    hasApiKey?: boolean;
	    protocol: string;
	    models: string[];
	    defaultModel: string;
	    contextWindow: number;
	    maxOutputTokens: number;
	
	    static createFrom(source: any = {}) {
	        return new Provider(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	        this.hasApiKey = source["hasApiKey"];
	        this.protocol = source["protocol"];
	        this.models = source["models"];
	        this.defaultModel = source["defaultModel"];
	        this.contextWindow = source["contextWindow"];
	        this.maxOutputTokens = source["maxOutputTokens"];
	    }
	}
	export class PullRequestItem {
	    id: string;
	    title: string;
	    number: number;
	    state: string;
	    author: string;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new PullRequestItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.number = source["number"];
	        this.state = source["state"];
	        this.author = source["author"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class RuntimeEvent {
	    eventId: string;
	    sessionId: string;
	    turnId: string;
	    seq: number;
	    timestamp: number;
	    type: string;
	    payload?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new RuntimeEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.eventId = source["eventId"];
	        this.sessionId = source["sessionId"];
	        this.turnId = source["turnId"];
	        this.seq = source["seq"];
	        this.timestamp = source["timestamp"];
	        this.type = source["type"];
	        this.payload = source["payload"];
	    }
	}
	export class SSHConnection {
	    id: string;
	    name: string;
	    host: string;
	    user: string;
	    port: number;
	    identity: string;
	    authMethod?: string;
	    status?: string;
	    lastCheckedAt?: number;
	    lastError?: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHConnection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.user = source["user"];
	        this.port = source["port"];
	        this.identity = source["identity"];
	        this.authMethod = source["authMethod"];
	        this.status = source["status"];
	        this.lastCheckedAt = source["lastCheckedAt"];
	        this.lastError = source["lastError"];
	    }
	}
	export class ScheduledTask {
	    id: string;
	    title: string;
	    when: string;
	    status: string;
	    cron: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new ScheduledTask(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.when = source["when"];
	        this.status = source["status"];
	        this.cron = source["cron"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class SessionContext {
	    summary?: string;
	    compactedAt?: number;
	    compactionCount?: number;
	
	    static createFrom(source: any = {}) {
	        return new SessionContext(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.summary = source["summary"];
	        this.compactedAt = source["compactedAt"];
	        this.compactionCount = source["compactionCount"];
	    }
	}
	export class SessionTask {
	    id: string;
	    step: string;
	    status: string;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new SessionTask(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.step = source["step"];
	        this.status = source["status"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class SessionRuntime {
	    status?: string;
	    phase?: string;
	    turnId?: string;
	    startedAt?: number;
	    finishedAt?: number;
	    lastEventSeq?: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionRuntime(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.phase = source["phase"];
	        this.turnId = source["turnId"];
	        this.startedAt = source["startedAt"];
	        this.finishedAt = source["finishedAt"];
	        this.lastEventSeq = source["lastEventSeq"];
	        this.error = source["error"];
	    }
	}
	export class Session {
	    id: string;
	    title: string;
	    projectId: string;
	    providerId: string;
	    model: string;
	    pinned: boolean;
	    archived?: boolean;
	    archivedAt?: number;
	    messages: Message[];
	    runtime?: SessionRuntime;
	    tasks?: SessionTask[];
	    taskExplanation?: string;
	    context?: SessionContext;
	    runtimeEvents?: RuntimeEvent[];
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Session(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.projectId = source["projectId"];
	        this.providerId = source["providerId"];
	        this.model = source["model"];
	        this.pinned = source["pinned"];
	        this.archived = source["archived"];
	        this.archivedAt = source["archivedAt"];
	        this.messages = this.convertValues(source["messages"], Message);
	        this.runtime = this.convertValues(source["runtime"], SessionRuntime);
	        this.tasks = this.convertValues(source["tasks"], SessionTask);
	        this.taskExplanation = source["taskExplanation"];
	        this.context = this.convertValues(source["context"], SessionContext);
	        this.runtimeEvents = this.convertValues(source["runtimeEvents"], RuntimeEvent);
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class Settings {
	    theme: string;
	    defaultPermissions: string;
	    autoReview: boolean;
	    fullAccess: boolean;
	    dataDir?: string;
	    activeProviderId: string;
	    activeModel: string;
	    activeSessionId?: string;
	    activeProjectId?: string;
	    shell: string;
	    terminalShell: string;
	    language: string;
	    mcpServer: boolean;
	    mcpServerPort: number;
	    fileOpenDestination: string;
	    bottomPanel: boolean;
	    followUpMode: string;
	    suggestedPrompts: boolean;
	    notifyTaskUpdates: boolean;
	    notifyScheduled: boolean;
	    approvalPolicy: string;
	    sandbox: string;
	    runtimeParams?: AgentRuntimeParams;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.defaultPermissions = source["defaultPermissions"];
	        this.autoReview = source["autoReview"];
	        this.fullAccess = source["fullAccess"];
	        this.dataDir = source["dataDir"];
	        this.activeProviderId = source["activeProviderId"];
	        this.activeModel = source["activeModel"];
	        this.activeSessionId = source["activeSessionId"];
	        this.activeProjectId = source["activeProjectId"];
	        this.shell = source["shell"];
	        this.terminalShell = source["terminalShell"];
	        this.language = source["language"];
	        this.mcpServer = source["mcpServer"];
	        this.mcpServerPort = source["mcpServerPort"];
	        this.fileOpenDestination = source["fileOpenDestination"];
	        this.bottomPanel = source["bottomPanel"];
	        this.followUpMode = source["followUpMode"];
	        this.suggestedPrompts = source["suggestedPrompts"];
	        this.notifyTaskUpdates = source["notifyTaskUpdates"];
	        this.notifyScheduled = source["notifyScheduled"];
	        this.approvalPolicy = source["approvalPolicy"];
	        this.sandbox = source["sandbox"];
	        this.runtimeParams = this.convertValues(source["runtimeParams"], AgentRuntimeParams);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ShortcutBinding {
	    id: string;
	    label: string;
	    keys: string[];
	
	    static createFrom(source: any = {}) {
	        return new ShortcutBinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.keys = source["keys"];
	    }
	}
	export class SkillEntry {
	    id: string;
	    name: string;
	    description?: string;
	    path: string;
	    source: string;
	    triggers?: string[];
	    allowedTools?: string[];
	    enabled: boolean;
	    builtin?: boolean;
	    updatedAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new SkillEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.path = source["path"];
	        this.source = source["source"];
	        this.triggers = source["triggers"];
	        this.allowedTools = source["allowedTools"];
	        this.enabled = source["enabled"];
	        this.builtin = source["builtin"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class SnapshotEntry {
	    id: string;
	    sessionId: string;
	    title?: string;
	    label?: string;
	    messageCount: number;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new SnapshotEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sessionId = source["sessionId"];
	        this.title = source["title"];
	        this.label = source["label"];
	        this.messageCount = source["messageCount"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class WorktreeEntry {
	    path: string;
	    branch?: string;
	    projectId?: string;
	    createdAt?: number;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new WorktreeEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.branch = source["branch"];
	        this.projectId = source["projectId"];
	        this.createdAt = source["createdAt"];
	        this.status = source["status"];
	    }
	}
	export class State {
	    schemaVersion: number;
	    settings: Settings;
	    preferences: Preferences;
	    providers: Provider[];
	    projects: Project[];
	    sessions: Session[];
	    shortcuts: ShortcutBinding[];
	    plugins: PluginEntry[];
	    pets: Pet[];
	    connections: SSHConnection[];
	    scheduled: ScheduledTask[];
	    pullRequests: PullRequestItem[];
	    dependencies?: DependencyCheckResult[];
	    hooks?: HookEntry[];
	    mcpServers?: MCPServerEntry[];
	    sitePermissions?: BrowserSitePermission[];
	    worktrees?: WorktreeEntry[];
	    notifications?: NotificationEvent[];
	    memory?: MemoryItem[];
	    snapshots?: SnapshotEntry[];
	    skills?: SkillEntry[];
	    gitRepos?: GitRepoEntry[];
	    lspServers?: LSPServerEntry[];
	
	    static createFrom(source: any = {}) {
	        return new State(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schemaVersion = source["schemaVersion"];
	        this.settings = this.convertValues(source["settings"], Settings);
	        this.preferences = this.convertValues(source["preferences"], Preferences);
	        this.providers = this.convertValues(source["providers"], Provider);
	        this.projects = this.convertValues(source["projects"], Project);
	        this.sessions = this.convertValues(source["sessions"], Session);
	        this.shortcuts = this.convertValues(source["shortcuts"], ShortcutBinding);
	        this.plugins = this.convertValues(source["plugins"], PluginEntry);
	        this.pets = this.convertValues(source["pets"], Pet);
	        this.connections = this.convertValues(source["connections"], SSHConnection);
	        this.scheduled = this.convertValues(source["scheduled"], ScheduledTask);
	        this.pullRequests = this.convertValues(source["pullRequests"], PullRequestItem);
	        this.dependencies = this.convertValues(source["dependencies"], DependencyCheckResult);
	        this.hooks = this.convertValues(source["hooks"], HookEntry);
	        this.mcpServers = this.convertValues(source["mcpServers"], MCPServerEntry);
	        this.sitePermissions = this.convertValues(source["sitePermissions"], BrowserSitePermission);
	        this.worktrees = this.convertValues(source["worktrees"], WorktreeEntry);
	        this.notifications = this.convertValues(source["notifications"], NotificationEvent);
	        this.memory = this.convertValues(source["memory"], MemoryItem);
	        this.snapshots = this.convertValues(source["snapshots"], SnapshotEntry);
	        this.skills = this.convertValues(source["skills"], SkillEntry);
	        this.gitRepos = this.convertValues(source["gitRepos"], GitRepoEntry);
	        this.lspServers = this.convertValues(source["lspServers"], LSPServerEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	

}

