const fs = require('node:fs');
const path = require('node:path');
const { lineFromIndex, normalizePath, slugify } = require('./helpers');

const ANALYZER_VERSION = 16;
const QUERY_BOUNDING_CALL_REGEX =
  /->(?:paginate|simplePaginate|cursorPaginate|limit|take|forPage|first|find|value|exists|count|max|min|avg|sum|pluck|chunk|chunkById|lazy|lazyById|cursor)\s*\(/;

function createMetrics() {
  return {
    scannedPhpFiles: 1,
    controllers: 0,
    controllersUsingService: 0,
    controllersWithDirectModel: 0,
    controllersUsingFormRequest: 0,
    directModelCalls: 0,
    modelAllCallsInController: 0,
    requestAllCalls: 0,
    fatControllers: 0,
    largeControllerMethods: 0,
    services: 0,
    modelAllCallsInService: 0,
    jobs: 0,
    queueJobsMissingTries: 0,
    queueJobsMissingTimeout: 0,
    queueJobsWithoutFailedHandler: 0,
    criticalQueueJobsWithoutUnique: 0,
    listeners: 0,
    listenerWithoutQueue: 0,
    middlewares: 0,
    fatMiddlewares: 0,
    middlewaresWithDirectModel: 0,
    helpers: 0,
    fatHelpers: 0,
    helpersWithDirectModel: 0,
    validators: 0,
    fatValidators: 0,
    validatorsWithoutEntrypoint: 0,
    exceptions: 0,
    valueObjects: 0,
    mutableValueObjects: 0,
    channels: 0,
    mails: 0,
    mailsWithoutQueue: 0,
    mailsWithSensitiveData: 0,
    loggingClasses: 0,
    loggingWithSensitiveData: 0,
    formComponents: 0,
    fatFormComponents: 0,
    scopes: 0,
    scopesWithoutApply: 0,
    kernels: 0,
    websocketClasses: 0,
    websocketWithoutAuthSignals: 0,
    filamentSupportFiles: 0,
    broadcastingClasses: 0,
    queueSupportClasses: 0,
    providers: 0,
    fatProviders: 0,
    providersWithContainerBindings: 0,
    providersWithContractImportsWithoutBindings: 0,
    events: 0,
    fatEvents: 0,
    eventsWithDirectModel: 0,
    eventsWithDatabaseAccess: 0,
    observers: 0,
    fatObservers: 0,
    observersWithDirectModel: 0,
    notifications: 0,
    fatNotifications: 0,
    notificationsWithoutQueue: 0,
    notificationsWithSensitiveData: 0,
    traits: 0,
    fatTraits: 0,
    highCouplingTraits: 0,
    traitsWithDirectModel: 0,
    contracts: 0,
    contractsWithContainerBinding: 0,
    contractsWithoutContainerBinding: 0,
    httpResources: 0,
    httpResourcesUsingWhenLoaded: 0,
    httpResourcesWithoutWhenLoaded: 0,
    httpResourceRelationsWithoutWhenLoaded: 0,
    enums: 0,
    dtos: 0,
    commands: 0,
    modelAllCallsInCommand: 0,
    fatCommands: 0,
    models: 0,
    policies: 0,
    fatModels: 0,
    filamentResources: 0,
    fatFilamentResources: 0,
    filamentPages: 0,
    fatFilamentPages: 0,
    filamentPagesWithAuth: 0,
    filamentWidgets: 0,
    fatFilamentWidgets: 0,
    filamentWidgetsWithAuth: 0,
    routeFiles: 0,
    routeFilesWithAuth: 0,
    routeFilesWithThrottle: 0,
    routeFilesWithoutCsrf: 0,
    stateChangingRouteFilesWithoutAuth: 0,
    stateChangingRouteFilesWithoutThrottle: 0,
    livewireComponents: 0,
    livewirePublicProperties: 0,
    livewireLockedProperties: 0,
    authorizationChecks: 0,
    canAccessPanelCalls: 0,
    rawSqlCalls: 0,
    unsafeRawSqlCalls: 0,
    safeRawSqlCalls: 0,
    dynamicRawSql: 0,
    dangerousSinkCalls: 0,
    uploadHandlingMentions: 0,
    uploadValidationMentions: 0,
    webhookHandlingMentions: 0,
    webhookSignatureMentions: 0,
    hasFilamentPageAuth: false,
    hasFilamentWidgetAuth: false,
    unboundedGetCalls: 0,
    possibleNPlusOneRisks: 0,
    criticalWritesWithoutTransaction: 0,
    missingTests: 0,
  };
}

function createSignals() {
  return {
    usesService: false,
    usesFormRequest: false,
    directModelCalls: [],
    requestAllCalls: [],
    modelAllCalls: [],
    dynamicRawSqlLines: [],
    rawSqlLines: [],
    dangerousSinkCalls: [],
    fileLineCount: 0,
    largeMethodCount: 0,
    methodCount: 0,
    hasRouteAuth: false,
    hasRouteThrottle: false,
    hasRouteWithoutCsrf: false,
    hasStateChangingRoute: false,
    livewirePublicPropertyCount: 0,
    livewireLockedPropertyCount: 0,
    authorizationChecks: 0,
    canAccessPanelCalls: 0,
    uploadHandlingMentions: 0,
    uploadValidationMentions: 0,
    webhookHandlingMentions: 0,
    webhookSignatureMentions: 0,
    unboundedGetLines: [],
    hasEagerLoading: false,
    loopRelationAccessCount: 0,
    hasDbTransaction: false,
    hasCriticalWrite: false,
    isQueuedJob: false,
    hasQueueTries: false,
    hasQueueTimeout: false,
    hasQueueUnique: false,
    hasQueueFailedHandler: false,
    hasWhenLoaded: false,
    resourceRelationAccesses: [],
    hasTest: false,
  };
}

function threshold(thresholds, key, fallback) {
  const candidate = Number(thresholds?.[key]);
  if (Number.isNaN(candidate) || candidate <= 0) {
    return fallback;
  }
  return candidate;
}

function detectKind(relativePath, content) {
  const normalized = normalizePath(relativePath);

  if (normalized.startsWith('routes/') && normalized.endsWith('.php')) {
    return 'route-file';
  }

  if (normalized.includes('/Http/Controllers/')) {
    return 'controller';
  }

  if (normalized.includes('/Services/')) {
    return 'service';
  }

  if (normalized.includes('/Actions/') || normalized.includes('/UseCases/')) {
    return 'service';
  }

  if (normalized.includes('/Console/Commands/')) {
    return 'command';
  }

  if (normalized.includes('/Jobs/')) {
    return 'job';
  }

  if (normalized.includes('/Listeners/')) {
    return 'listener';
  }

  if (normalized.includes('/Http/Middleware/')) {
    return 'middleware';
  }

  if (normalized.includes('/Helpers/') || normalized.includes('/Utils/')) {
    return 'helper';
  }

  if (normalized.includes('/Validators/') || normalized.includes('/Rules/') || /\/Domain\/.+\/Validators\//.test(normalized)) {
    return 'validator';
  }

  if (normalized.includes('/Exceptions/')) {
    return 'exception';
  }

  if (normalized.includes('/ValueObjects/')) {
    return 'value-object';
  }

  if (normalized.includes('/Channels/')) {
    return 'channel';
  }

  if (normalized.includes('/Mail/')) {
    return 'mail';
  }

  if (normalized.includes('/Logging/')) {
    return 'logging';
  }

  if (normalized.includes('/Forms/') || normalized.includes('/Tables/')) {
    return 'form-component';
  }

  if (normalized.includes('/Scopes/')) {
    return 'scope';
  }

  if (normalized === 'app/Http/Kernel.php' || normalized === 'app/Console/Kernel.php') {
    return 'kernel';
  }

  if (normalized.includes('/Websocket/')) {
    return 'websocket';
  }

  if (normalized.includes('/Broadcasting/')) {
    return 'broadcasting';
  }

  if (normalized.includes('/Queue/')) {
    return 'queue-support';
  }

  if (normalized.includes('/Providers/')) {
    return 'provider';
  }

  if (normalized.includes('/Events/')) {
    return 'event';
  }

  if (normalized.includes('/Observers/')) {
    return 'observer';
  }

  if (normalized.includes('/Notifications/')) {
    return 'notification';
  }

  if (normalized.includes('/Traits/')) {
    return 'trait';
  }

  if (normalized.includes('/Contracts/')) {
    return 'contract';
  }

  if (normalized.includes('/Http/Resources/')) {
    return 'http-resource';
  }

  if (normalized.includes('/Filament/') && normalized.includes('/Resources/')) {
    return 'filament-resource';
  }

  if (normalized.includes('/Filament/') && normalized.includes('/Pages/')) {
    return 'filament-page';
  }

  if (normalized.includes('/Filament/') && normalized.includes('/Widgets/')) {
    return 'filament-widget';
  }

  if (normalized.includes('/Filament/')) {
    return 'filament-support';
  }

  if (normalized.includes('/Livewire/')) {
    return 'livewire-component';
  }

  if (normalized.includes('/Models/')) {
    return 'model';
  }

  if (normalized.includes('/Policies/') || normalized.endsWith('Policy.php')) {
    return 'policy';
  }

  if (normalized.includes('/Http/Requests/')) {
    return 'request';
  }

  if (normalized.includes('/Enums/')) {
    return 'enum';
  }

  if (normalized.includes('/DTOs/') || normalized.includes('/Dtos/') || normalized.includes('/Data/')) {
    return 'dto';
  }

  if (/extends\s+Controller\b/.test(content)) {
    return 'controller';
  }

  if (/extends\s+Model\b/.test(content)) {
    return 'model';
  }

  if (/class\s+[A-Za-z0-9_]+Policy\b/.test(content)) {
    return 'policy';
  }

  if (/extends\s+Command\b/.test(content)) {
    return 'command';
  }

  if (/extends\s+[A-Za-z0-9_\\]*Exception\b/.test(content) || /implements\s+[^{\n]*Throwable\b/.test(content)) {
    return 'exception';
  }

  if (/extends\s+[A-Za-z0-9_\\]*Mailable\b/.test(content)) {
    return 'mail';
  }

  if (/class\s+[A-Za-z0-9_]+Validator\b/.test(content)) {
    return 'validator';
  }

  if (/class\s+[A-Za-z0-9_]+Observer\b/.test(content)) {
    return 'observer';
  }

  if (/class\s+[A-Za-z0-9_]+Scope\b/.test(content) || /implements\s+[^{\n]*Scope\b/.test(content)) {
    return 'scope';
  }

  if (/extends\s+ServiceProvider\b/.test(content)) {
    return 'provider';
  }

  if (/implements\s+[^{\n]*ShouldQueue\b/.test(content) && /class\s+[A-Za-z0-9_]+(?:Job|Listener)\b/.test(content)) {
    return /Listener\b/.test(content) ? 'listener' : 'job';
  }

  if (/extends\s+Notification\b/.test(content)) {
    return 'notification';
  }

  if (/extends\s+Resource\b/.test(content)) {
    return 'filament-resource';
  }

  if (/extends\s+Component\b/.test(content) && /Livewire/i.test(content)) {
    return 'livewire-component';
  }

  if (/extends\s+FormRequest\b/.test(content)) {
    return 'request';
  }

  if (/namespace\s+App\\Contracts\\/.test(content)) {
    return 'contract';
  }

  if (/extends\s+(?:JsonResource|ResourceCollection)\b/.test(content)) {
    return 'http-resource';
  }

  if (/enum\s+[A-Za-z0-9_]+\b/.test(content)) {
    return 'enum';
  }

  if (/class\s+[A-Za-z0-9_]+(?:Dto|DTO|Data)\b/.test(content)) {
    return 'dto';
  }

  return 'other';
}

function collectImports(content) {
  const imports = [];
  const regex = /^use\s+([^;]+);/gm;

  for (const match of content.matchAll(regex)) {
    const raw = match[1].trim();
    const aliasMatch = raw.split(/\s+as\s+/i);
    const fqcn = aliasMatch[0].trim();
    const alias = (aliasMatch[1] || fqcn.split('\\').pop()).trim();
    imports.push({ fqcn, alias });
  }

  return imports;
}

function collectImportedModelAliases(content) {
  return new Set(
    collectImports(content)
      .filter((item) => item.fqcn.startsWith('App\\Models\\'))
      .map((item) => item.alias),
  );
}

function collectModelStaticCalls(content, modelAliases) {
  const calls = [];
  for (const match of content.matchAll(/\b([A-Z][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const className = match[1];
    const method = match[2];
    if (!modelAliases.has(className)) {
      continue;
    }
    calls.push({
      className,
      method,
      line: lineFromIndex(content, match.index),
    });
  }
  return calls;
}

function hasContainerBindingSignal(content) {
  return (
    /\b(?:\$this->app|app\s*\(\s*\))->(?:bind|singleton|scoped)\s*\(/.test(content) ||
    /\b(?:bind|singleton|scoped)\s*\(\s*[A-Za-z0-9_\\]+Interface::class\s*,/.test(content)
  );
}

function hasDbFacadeAccess(content) {
  return /\bDB::(?:table|select|selectRaw|insert|update|delete|statement|raw)\s*\(/.test(content);
}

function hasNotificationSensitivePayload(content) {
  const hasPayloadSurface = /\bfunction\s+(?:toMail|toArray|toDatabase|toBroadcast)\s*\(/.test(content);
  if (!hasPayloadSurface) {
    return false;
  }

  return /\$this->(?:password|secret|token|apiKey|accessToken|refreshToken|otp|code)\b/i.test(content);
}

function hasMailSensitivePayload(content) {
  const hasPayloadSurface = /\bfunction\s+(?:build|content|envelope|toMail)\s*\(/.test(content);
  if (!hasPayloadSurface) {
    return false;
  }

  return /\$this->(?:password|secret|token|apiKey|accessToken|refreshToken|otp|code)\b/i.test(content);
}

function hasLogSensitivePayload(content) {
  return /\bLog::(?:debug|info|notice|warning|error|critical|alert|emergency)\s*\([\s\S]{0,240}?(?:password|secret|token|api[_-]?key|authorization)/i.test(
    content,
  );
}

function listPhpFilesRecursive(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return [];
  }

  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith('.php')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function classBasename(candidate) {
  if (!candidate) {
    return '';
  }
  const normalized = String(candidate).replace(/\\\\/g, '\\').replace(/^\\+/, '');
  const parts = normalized.split('\\');
  return parts[parts.length - 1] || '';
}

function extractClassNameFromBindingArg(argument) {
  const raw = String(argument || '').trim();
  if (!raw) {
    return '';
  }

  const classRefMatch = raw.match(/([A-Za-z0-9_\\]+)::class/);
  if (classRefMatch) {
    return classBasename(classRefMatch[1]);
  }

  const quotedClassMatch = raw.match(/['"]([A-Za-z0-9_\\\\]+)['"]/);
  if (quotedClassMatch) {
    return classBasename(quotedClassMatch[1]);
  }

  return classBasename(raw);
}

function collectBoundContractsFromProviders(root) {
  const boundContracts = new Set();
  const providerFiles = listPhpFilesRecursive(path.join(root, 'app', 'Providers'));

  providerFiles.forEach((providerPath) => {
    let content = '';
    try {
      content = fs.readFileSync(providerPath, 'utf8');
    } catch (error) {
      return;
    }

    for (const match of content.matchAll(/\b(?:bind|singleton|scoped)\s*\(\s*([A-Za-z0-9_\\:'"]+)\s*,/g)) {
      const contractName = extractClassNameFromBindingArg(match[1]);
      if (contractName.endsWith('Interface')) {
        boundContracts.add(contractName);
      }
    }

    for (const match of content.matchAll(/\b([A-Za-z0-9_\\]+Interface)::class\s*=>\s*[A-Za-z0-9_\\]+::class/g)) {
      const contractName = classBasename(match[1]);
      if (contractName.endsWith('Interface')) {
        boundContracts.add(contractName);
      }
    }
  });

  return boundContracts;
}

function createAnalysisContext(root) {
  return {
    boundContracts: collectBoundContractsFromProviders(root),
  };
}

function analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations }) {
  const matcher = /\b(?:DB::raw|selectRaw|whereRaw|orWhereRaw|orderByRaw|havingRaw)\s*\(/g;
  let reviewLine = null;
  let reviewCount = 0;

  for (const match of content.matchAll(matcher)) {
    const line = lineFromIndex(content, match.index);
    const callSnippet = extractCallSnippet(content, match.index);
    const callArguments = extractCallArguments(callSnippet);
    const sqlExpression = String(callArguments[0] || '').trim();
    const hasSqlLiteral = isQuotedStringLiteral(sqlExpression);
    const hasVariableInSqlLiteral = /['"`][^'"`]*\$\w+[^'"`]*['"`]/.test(sqlExpression);
    const hasTemplateInterpolation = /\{\$[A-Za-z_]/.test(sqlExpression);
    const hasConcat = /(?:['"`]\s*\.\s*(?:\$|request\s*\(|input\s*\()|(?:\$|request\s*\(|input\s*\().*\.)/i.test(sqlExpression);
    const hasRequestInputInSqlExpression = /\$request->|\brequest\s*\(|\binput\s*\(/i.test(sqlExpression);
    const hasBindingsArg = callArguments.length > 1;
    const hasPlaceholder = /\?/.test(sqlExpression);
    const hasDynamicSqlExpression = sqlExpression && !hasSqlLiteral;

    metrics.rawSqlCalls += 1;
    signals.rawSqlLines.push(line);

    const isUnsafe =
      hasVariableInSqlLiteral ||
      hasTemplateInterpolation ||
      hasConcat ||
      hasRequestInputInSqlExpression ||
      hasDynamicSqlExpression ||
      (hasPlaceholder && !hasBindingsArg);

    if (isUnsafe) {
      metrics.unsafeRawSqlCalls += 1;
      metrics.dynamicRawSql += 1;
      signals.dynamicRawSqlLines.push(line);
      reviewLine = reviewLine || line;
      reviewCount += 1;

      violations.push(
        createViolation({
          type: 'dynamic-raw-sql',
          severity: 'medium',
          file: relativePath,
          line,
          message: 'Raw SQL potencialmente dinâmico/inseguro detectado',
          rationale: 'Interpolação/concatenação em raw SQL pode introduzir risco de SQL injection e regressões de query.',
          suggestion: 'Prefira bindings (`?` + array) ou Query Builder sem concatenação dinâmica.',
        }),
      );
    } else {
      metrics.safeRawSqlCalls += 1;
    }
  }

  if (reviewLine != null) {
    violations.push(
      createViolation({
        type: 'raw-sql-review',
        severity: 'low',
        file: relativePath,
        line: reviewLine,
        message: `${reviewCount} uso(s) de SQL raw exigem revisão contextual`,
        rationale: 'Pontos raw com sinais dinâmicos devem ser revisados para segurança e previsibilidade.',
        suggestion: 'Confirme bindings, whitelists e limites explícitos.',
      }),
    );
  }
}

function createViolation({ type, severity, file, line, message, suggestion, rationale = '' }) {
  const id = slugify(`${type}:${file}:${line}:${message}`);

  return {
    id,
    type,
    severity,
    file,
    line,
    message,
    suggestion,
    rationale,
  };
}

function findMatchingDelimiter(text, openIndex, openChar, closeChar) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escapeNext = false;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (!escapeNext && char === "'") {
        inSingleQuote = false;
      }
      escapeNext = !escapeNext && char === '\\';
      continue;
    }

    if (inDoubleQuote) {
      if (!escapeNext && char === '"') {
        inDoubleQuote = false;
      }
      escapeNext = !escapeNext && char === '\\';
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      escapeNext = false;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      escapeNext = false;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return text.length - 1;
}

function findMatchingBrace(text, openBraceIndex) {
  return findMatchingDelimiter(text, openBraceIndex, '{', '}');
}

function findMatchingParenthesis(text, openParenIndex) {
  return findMatchingDelimiter(text, openParenIndex, '(', ')');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitTopLevelArguments(rawArgs) {
  const args = [];
  let current = '';
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escapeNext = false;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const char = rawArgs[index];
    const nextChar = rawArgs[index + 1];

    if (inLineComment) {
      current += char;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += '/';
        index += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (!escapeNext && char === "'") {
        inSingleQuote = false;
      }
      escapeNext = !escapeNext && char === '\\';
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (!escapeNext && char === '"') {
        inDoubleQuote = false;
      }
      escapeNext = !escapeNext && char === '\\';
      continue;
    }

    if (char === '/' && nextChar === '/') {
      current += '//';
      index += 1;
      inLineComment = true;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      current += '/*';
      index += 1;
      inBlockComment = true;
      continue;
    }

    if (char === "'") {
      current += char;
      inSingleQuote = true;
      escapeNext = false;
      continue;
    }

    if (char === '"') {
      current += char;
      inDoubleQuote = true;
      escapeNext = false;
      continue;
    }

    if (char === '(') depthParen += 1;
    else if (char === ')') depthParen = Math.max(0, depthParen - 1);
    else if (char === '[') depthBracket += 1;
    else if (char === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (char === '{') depthBrace += 1;
    else if (char === '}') depthBrace = Math.max(0, depthBrace - 1);

    if (char === ',' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      if (current.trim()) {
        args.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function extractCallArguments(callSnippet) {
  const openParenIndex = callSnippet.indexOf('(');
  if (openParenIndex === -1) {
    return [];
  }

  const closeParenIndex = findMatchingParenthesis(callSnippet, openParenIndex);
  if (closeParenIndex <= openParenIndex) {
    return [];
  }

  const rawArgs = callSnippet.slice(openParenIndex + 1, closeParenIndex);
  return splitTopLevelArguments(rawArgs);
}

function isQuotedStringLiteral(expression) {
  const raw = String(expression || '').trim();
  if (!raw) {
    return false;
  }
  return (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  );
}

function extractCallSnippet(content, startIndex) {
  const openParenIndex = content.indexOf('(', startIndex);
  if (openParenIndex === -1) {
    return content.slice(startIndex, Math.min(content.length, startIndex + 300));
  }
  const closeParenIndex = findMatchingParenthesis(content, openParenIndex);
  return content.slice(startIndex, closeParenIndex + 1);
}

function extractFunctionBlocks(content) {
  const blocks = [];
  const regex = /function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*(?::\s*[^\{\n]+)?\s*\{/g;
  let match = regex.exec(content);

  while (match) {
    const start = match.index || 0;
    const openBraceIndex = content.indexOf('{', start);
    if (openBraceIndex === -1) {
      break;
    }

    const closeBraceIndex = findMatchingBrace(content, openBraceIndex);
    const fragment = content.slice(start, closeBraceIndex + 1);
    blocks.push({
      start,
      end: closeBraceIndex,
      line: lineFromIndex(content, start),
      lines: fragment.split('\n').length,
    });

    regex.lastIndex = closeBraceIndex + 1;
    match = regex.exec(content);
  }

  return blocks;
}

function analyzeDangerousSinks({ relativePath, content, metrics, signals, violations }) {
  const regex = /\b(unserialize|eval|assert|shell_exec|exec|passthru|proc_open|popen)\s*\(/g;

  for (const match of content.matchAll(regex)) {
    const sink = match[1];
    const line = lineFromIndex(content, match.index);
    metrics.dangerousSinkCalls += 1;
    signals.dangerousSinkCalls.push({
      sink,
      line,
    });

    violations.push(
      createViolation({
        type: 'dangerous-php-sink',
        severity: 'high',
        file: relativePath,
        line,
        message: `Uso de sink perigoso detectado: ${sink}()`,
        rationale: 'Sinks de execução/desserialização exigem validação rígida para evitar RCE e abuse.',
        suggestion: 'Evite sink direto; aplique allowlist/validação estrita e isolamento operacional.',
      }),
    );
  }
}

function analyzeCommonSecuritySignals({ content, metrics, signals }) {
  const authorizationChecks = Array.from(
    content.matchAll(/\$this->authorize\s*\(|Gate::(?:authorize|allows|denies|check)\s*\(|->can\s*\(/g),
  ).length;
  metrics.authorizationChecks += authorizationChecks;
  signals.authorizationChecks = authorizationChecks;

  const canAccessPanelCalls = Array.from(content.matchAll(/\bcanAccessPanel\s*\(/g)).length;
  metrics.canAccessPanelCalls += canAccessPanelCalls;
  signals.canAccessPanelCalls = canAccessPanelCalls;

  const uploadHandlingMentions = Array.from(
    content.matchAll(/\b(?:storeAs|putFile|putFileAs|UploadedFile|upload)\b/gi),
  ).length;
  const uploadValidationMentions = Array.from(
    content.matchAll(/\b(?:mimes:|mimetypes:|image\b|max:\d+|dimensions:)\b/gi),
  ).length;
  metrics.uploadHandlingMentions += uploadHandlingMentions;
  metrics.uploadValidationMentions += uploadValidationMentions;
  signals.uploadHandlingMentions = uploadHandlingMentions;
  signals.uploadValidationMentions = uploadValidationMentions;

  const webhookHandlingMentions = Array.from(content.matchAll(/\bwebhook\b/gi)).length;
  const webhookSignatureMentions = Array.from(
    content.matchAll(/\b(?:hash_hmac|x-signature|signature|verifySignature|signed)\b/gi),
  ).length;
  metrics.webhookHandlingMentions += webhookHandlingMentions;
  metrics.webhookSignatureMentions += webhookSignatureMentions;
  signals.webhookHandlingMentions = webhookHandlingMentions;
  signals.webhookSignatureMentions = webhookSignatureMentions;
}

function hasAuthorizationSignal(content) {
  return (
    /\$this->authorize\s*\(/.test(content) ||
    /Gate::(?:authorize|allows|denies|check|any|none)\s*\(/.test(content) ||
    /auth\s*\(\)\s*->user\s*\(\)\s*->can\s*\(/.test(content) ||
    /->can\s*\(/.test(content) ||
    /\bcanAccessPanel\s*\(/.test(content)
  );
}

function hasFilamentPageAuthorizationSignal(content) {
  return (
    /\bstatic\s+function\s+canAccess\s*\(/.test(content) ||
    /\bfunction\s+canAccess\s*\(/.test(content) ||
    /\bstatic\s+function\s+shouldRegisterNavigation\s*\(/.test(content) ||
    hasAuthorizationSignal(content)
  );
}

function hasFilamentWidgetAuthorizationSignal(content) {
  return /\bstatic\s+function\s+canView\s*\(/.test(content) || /\bfunction\s+canView\s*\(/.test(content) || hasAuthorizationSignal(content);
}

function getStatementStartIndex(content, index) {
  return (
    Math.max(
      content.lastIndexOf(';', index),
      content.lastIndexOf('{', index),
      content.lastIndexOf('}', index),
    ) + 1
  );
}

function getStatementEndIndex(content, index) {
  const semicolonIndex = content.indexOf(';', index);
  return semicolonIndex === -1 ? content.length : semicolonIndex + 1;
}

function extractGetReceiverVariable(statementSnippet) {
  const receiverMatch = statementSnippet.match(/(\$[A-Za-z_][A-Za-z0-9_]*)\s*->\s*get\s*\(\s*\)/);
  return receiverMatch ? receiverMatch[1] : null;
}

function hasReceiverBoundingCallInLookback(content, getIndex, receiverVariable) {
  if (!receiverVariable) {
    return false;
  }

  const lookbackStart = Math.max(0, getIndex - 2400);
  const lookback = content.slice(lookbackStart, getIndex);
  const receiverBoundRegex = new RegExp(
    `${escapeRegExp(receiverVariable)}\\s*->\\s*(?:paginate|simplePaginate|cursorPaginate|limit|take|forPage|first|find|value|exists|count|max|min|avg|sum|pluck|chunk|chunkById|lazy|lazyById|cursor)\\s*\\(`,
  );
  return receiverBoundRegex.test(lookback);
}

function collectUnboundedGetLines(content) {
  const unbounded = [];

  for (const match of content.matchAll(/->get\s*\(\s*\)/g)) {
    const getIndex = match.index || 0;
    const statementStart = getStatementStartIndex(content, getIndex);
    const statementEnd = getStatementEndIndex(content, getIndex);
    const statementSnippet = content.slice(statementStart, statementEnd);

    if (QUERY_BOUNDING_CALL_REGEX.test(statementSnippet)) {
      continue;
    }

    const receiverVariable = extractGetReceiverVariable(statementSnippet);
    if (hasReceiverBoundingCallInLookback(content, getIndex, receiverVariable)) {
      continue;
    }

    unbounded.push(lineFromIndex(content, getIndex));
  }

  return unbounded;
}

function detectLoopRelationAccessCount(content) {
  const variables = [];
  for (const match of content.matchAll(/foreach\s*\([^)]*?\bas\s*(?:\$\w+\s*=>\s*)?&?\$([A-Za-z_][A-Za-z0-9_]*)/g)) {
    variables.push(match[1]);
  }

  if (variables.length === 0) {
    return 0;
  }

  let count = 0;
  for (const variable of variables) {
    const relationRegex = new RegExp(`\\$${variable}->[A-Za-z_][A-Za-z0-9_]*->`, 'g');
    count += Array.from(content.matchAll(relationRegex)).length;
  }
  return count;
}

function collectResourceRelationAccesses(content) {
  const accesses = [];

  for (const match of content.matchAll(/=>\s*\$this->([A-Za-z_][A-Za-z0-9_]*)\s*\??->/g)) {
    accesses.push({
      relation: match[1],
      line: lineFromIndex(content, match.index),
    });
  }

  for (const match of content.matchAll(/new\s+[A-Za-z0-9_\\]+Resource(?:Collection)?\s*\(\s*\$this->([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)) {
    accesses.push({
      relation: match[1],
      line: lineFromIndex(content, match.index),
    });
  }

  for (const match of content.matchAll(/\b[A-Za-z0-9_\\]+Resource(?:Collection)?::(?:make|collection)\s*\(\s*\$this->([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)) {
    accesses.push({
      relation: match[1],
      line: lineFromIndex(content, match.index),
    });
  }

  return accesses;
}

function collectResourceGuardedRelations(content) {
  const guarded = new Set();

  for (const match of content.matchAll(/\b(?:whenLoaded|whenCounted|whenAggregated|relationLoaded)\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_\.]*)['"]/g)) {
    const relation = String(match[1] || '').split('.')[0];
    if (relation) {
      guarded.add(relation);
    }
  }

  return guarded;
}

function analyzeQueryDiscipline({ relativePath, content, metrics, signals, violations, sourceKind }) {
  const unboundedGetLines = collectUnboundedGetLines(content);
  signals.unboundedGetLines = unboundedGetLines;
  signals.hasEagerLoading = /\b(?:->|::)(?:with|load|loadMissing)\s*\(/.test(content);
  signals.loopRelationAccessCount = detectLoopRelationAccessCount(content);

  metrics.unboundedGetCalls += unboundedGetLines.length;
  if (unboundedGetLines.length > 0) {
    violations.push(
      createViolation({
        type: 'unbounded-get-query',
        severity: sourceKind === 'controller' ? 'medium' : 'low',
        file: relativePath,
        line: unboundedGetLines[0],
        message: `${unboundedGetLines.length} consulta(s) com \`->get()\` sem limite/paginação detectada(s)`,
        rationale: 'Consultas sem limite podem causar consumo excessivo de memória e latência em crescimento de dados.',
        suggestion: 'Prefira paginação (`paginate/cursorPaginate`) ou limite explícito para consultas potencialmente grandes.',
      }),
    );
  }

  if (signals.loopRelationAccessCount > 0 && !signals.hasEagerLoading) {
    metrics.possibleNPlusOneRisks += 1;
    violations.push(
      createViolation({
        type: 'possible-n-plus-one',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: 'Acesso a relações dentro de loop sem sinal de eager loading',
        rationale: 'Relações acessadas em loop sem `with/load` tendem a gerar N+1 queries.',
        suggestion: 'Avalie eager loading (`with/load`) antes do loop para reduzir round-trips ao banco.',
      }),
    );
  }
}

function analyzeCriticalWriteTransaction({ relativePath, content, metrics, signals, violations }) {
  const hasFinancialContext = /\b(withdraw|withdrawal|deposit|wallet|payment|transfer|balance|rollover|cashback|billing)\b/i.test(
    relativePath + '\n' + content,
  );
  const hasCriticalWrite = /(?:DB::table\s*\([^)]*\)->(?:insert|update|delete)|::create\s*\(|->(?:create|update|delete|save|increment|decrement)\s*\()/.test(
    content,
  );
  const hasDbTransaction = /\bDB::transaction\s*\(/.test(content);

  signals.hasCriticalWrite = hasCriticalWrite;
  signals.hasDbTransaction = hasDbTransaction;

  if (!hasFinancialContext || !hasCriticalWrite || hasDbTransaction) {
    return;
  }

  metrics.criticalWritesWithoutTransaction += 1;
  violations.push(
    createViolation({
      type: 'critical-write-without-transaction',
      severity: 'medium',
      file: relativePath,
      line: 1,
      message: 'Operação crítica de escrita sem sinal de transação detectada',
      rationale: 'Fluxos financeiros/de saldo sem transação explícita aumentam risco de inconsistência em concorrência/falhas parciais.',
      suggestion: 'Considere encapsular o fluxo em `DB::transaction(...)` e reforçar idempotência.',
    }),
  );
}

function analyzeController({ relativePath, content, metrics, signals, violations, testBasenames, thresholds }) {
  metrics.controllers = 1;
  signals.fileLineCount = content.split('\n').length;

  const imports = collectImports(content);
  const importedModels = imports
    .filter((item) => item.fqcn.startsWith('App\\Models\\'))
    .map((item) => item.alias);
  const importedServices = imports
    .filter(
      (item) =>
        item.fqcn.startsWith('App\\Services\\') ||
        item.fqcn.startsWith('App\\Actions\\') ||
        item.fqcn.startsWith('App\\UseCases\\'),
    )
    .map((item) => item.alias);

  const modelAliases = new Set(importedModels);

  const usesService =
    importedServices.length > 0 ||
    /\b[A-Z][A-Za-z0-9_\\]*(?:Service|Action|UseCase)\b/.test(content) ||
    /function\s+__construct\s*\([\s\S]*?\b[A-Z][A-Za-z0-9_\\]*(?:Service|Action|UseCase)\s+\$[A-Za-z_][A-Za-z0-9_]*[\s\S]*?\)/m.test(
      content,
    );
  signals.usesService = usesService;
  if (usesService) {
    metrics.controllersUsingService = 1;
  }

  const usesFormRequest = /function\s+\w+\s*\([^)]*\b[A-Za-z0-9_\\]*Request\s+\$[A-Za-z0-9_]+[^)]*\)/m.test(
    content,
  );
  signals.usesFormRequest = usesFormRequest;
  if (usesFormRequest) {
    metrics.controllersUsingFormRequest = 1;
  }

  const modelCalls = collectModelStaticCalls(content, modelAliases);
  for (const call of modelCalls) {
    const { className, method, line } = call;
    signals.directModelCalls.push(call);
    metrics.directModelCalls += 1;

    if (method === 'all') {
      metrics.modelAllCallsInController += 1;
      signals.modelAllCalls.push(call);
      violations.push(
        createViolation({
          type: 'model-all-in-controller',
          severity: 'high',
          file: relativePath,
          line,
          message: `Controller usando ${className}::all() diretamente`,
          rationale: 'Carregar tudo sem paginação tende a degradar performance em escala.',
          suggestion: 'Use paginação/filtros e delegue consulta para Service/UseCase.',
        }),
      );
    }
  }

  if (signals.directModelCalls.length > 0) {
    metrics.controllersWithDirectModel = 1;
  }

  for (const match of content.matchAll(/\$request->all\s*\(\s*\)/g)) {
    const line = lineFromIndex(content, match.index);
    signals.requestAllCalls.push({ line });
    metrics.requestAllCalls += 1;
    violations.push(
      createViolation({
        type: 'mass-assignment-risk',
        severity: 'medium',
        file: relativePath,
        line,
        message: 'Uso de $request->all() detectado',
        rationale: 'Aceitar payload completo aumenta risco de mass assignment e inconsistência de validação.',
        suggestion: 'Prefira `$request->validated()` com FormRequest ou DTO.',
      }),
    );
  }

  if (signals.fileLineCount > threshold(thresholds, 'fatControllerLines', 220)) {
    metrics.fatControllers = 1;
    violations.push(
      createViolation({
        type: 'fat-controller',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Controller com ${signals.fileLineCount} linhas`,
        rationale: 'Controllers extensos tendem a acumular responsabilidades.',
        suggestion: 'Quebre fluxos por Services/Actions menores.',
      }),
    );
  }

  const functionBlocks = extractFunctionBlocks(content);
  signals.methodCount = functionBlocks.length;
  for (const block of functionBlocks) {
    const methodLines = block.lines;
    if (methodLines > threshold(thresholds, 'largeControllerMethodLines', 80)) {
      metrics.largeControllerMethods += 1;
      signals.largeMethodCount += 1;
      violations.push(
        createViolation({
          type: 'large-controller-method',
          severity: 'low',
          file: relativePath,
          line: block.line,
          message: `Método de controller com ${methodLines} linhas`,
          rationale: 'Métodos extensos escondem múltiplas responsabilidades.',
          suggestion: 'Extrair blocos para Services/UseCases.',
        }),
      );
    }
  }

  const fileBasename = path.basename(relativePath, '.php');
  const hasMatchingTest = testBasenames.has(`${fileBasename}Test`) || testBasenames.has(fileBasename);
  signals.hasTest = hasMatchingTest;
  if (!hasMatchingTest) {
    metrics.missingTests += 1;
    violations.push(
      createViolation({
        type: 'missing-test',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Nenhum teste detectado para ${fileBasename}`,
        rationale: 'Cobertura baixa aumenta regressões em refactor.',
        suggestion: `Adicionar ao menos um teste para ${fileBasename}.`,
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
  analyzeQueryDiscipline({
    relativePath,
    content,
    metrics,
    signals,
    violations,
    sourceKind: 'controller',
  });
}

function analyzeService({ relativePath, content, metrics, signals, violations, testBasenames, thresholds }) {
  metrics.services = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  const fileBasename = path.basename(relativePath, '.php');
  const hasMatchingTest = testBasenames.has(`${fileBasename}Test`) || testBasenames.has(fileBasename);
  signals.hasTest = hasMatchingTest;

  if (!hasMatchingTest) {
    metrics.missingTests += 1;
    violations.push(
      createViolation({
        type: 'missing-test',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Service ${fileBasename} sem teste dedicado`,
        rationale: 'Serviços concentram regra de negócio e precisam validação de comportamento.',
        suggestion: `Adicionar teste unitário para ${fileBasename}.`,
      }),
    );
  }

  if (signals.fileLineCount > threshold(thresholds, 'fatServiceLines', 260)) {
    violations.push(
      createViolation({
        type: 'fat-service',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: `Service com ${signals.fileLineCount} linhas`,
        rationale: 'Services muito grandes viram ponto único de acoplamento e regressão.',
        suggestion: 'Separar em Actions/UseCases por responsabilidade.',
      }),
    );
  }

  const modelAliases = collectImportedModelAliases(content);
  const modelCalls = collectModelStaticCalls(content, modelAliases);
  modelCalls
    .filter((item) => item.method === 'all')
    .forEach((call) => {
      metrics.modelAllCallsInService += 1;
      signals.modelAllCalls.push(call);
      violations.push(
        createViolation({
          type: 'model-all-in-service',
          severity: 'medium',
          file: relativePath,
          line: call.line,
          message: `Service usando ${call.className}::all()`,
          rationale: 'Leitura sem paginação/filtro em service tende a custar caro em escala.',
          suggestion: 'Use paginação, chunking ou query com limites explícitos.',
        }),
      );
    });

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
  analyzeQueryDiscipline({
    relativePath,
    content,
    metrics,
    signals,
    violations,
    sourceKind: 'service',
  });
  analyzeCriticalWriteTransaction({ relativePath, content, metrics, signals, violations });
}

function hasQueueKeywordContext(relativePath, content) {
  return /(payment|withdraw|withdrawal|wallet|transfer|balance|billing|refund|bonus|cashback)/i.test(
    `${relativePath}\n${content}`,
  );
}

function analyzeJob({ relativePath, content, metrics, signals, violations, testBasenames, thresholds }) {
  metrics.jobs = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  const isQueuedJob = /implements\s+[^{\n]*ShouldQueue\b/.test(content) || /\buse\s+Queueable\b/.test(content);
  const hasQueueTries = /\b(?:public|protected)\s+\$tries\s*=\s*\d+/i.test(content);
  const hasQueueTimeout = /\b(?:public|protected)\s+\$timeout\s*=\s*\d+/i.test(content);
  const hasQueueUnique = /implements\s+[^{\n]*ShouldBeUnique(?:UntilProcessing)?\b/.test(content);
  const hasQueueFailedHandler = /\bfunction\s+failed\s*\(/.test(content);
  const isCriticalQueueJob = hasQueueKeywordContext(relativePath, content);

  signals.isQueuedJob = isQueuedJob;
  signals.hasQueueTries = hasQueueTries;
  signals.hasQueueTimeout = hasQueueTimeout;
  signals.hasQueueUnique = hasQueueUnique;
  signals.hasQueueFailedHandler = hasQueueFailedHandler;

  if (isQueuedJob && !hasQueueTries) {
    metrics.queueJobsMissingTries += 1;
    violations.push(
      createViolation({
        type: 'job-missing-tries',
        severity: isCriticalQueueJob ? 'medium' : 'low',
        file: relativePath,
        line: 1,
        message: 'Job enfileirado sem `$tries` explícito',
        rationale: 'Sem retries explícitos o comportamento de falha pode ficar inconsistente entre ambientes.',
        suggestion: 'Defina `$tries` de forma explícita no Job.',
      }),
    );
  }

  if (isQueuedJob && !hasQueueTimeout) {
    metrics.queueJobsMissingTimeout += 1;
    violations.push(
      createViolation({
        type: 'job-missing-timeout',
        severity: isCriticalQueueJob ? 'medium' : 'low',
        file: relativePath,
        line: 1,
        message: 'Job enfileirado sem `$timeout` explícito',
        rationale: 'Sem timeout claro, jobs presos podem degradar throughput da fila.',
        suggestion: 'Defina `$timeout` coerente com o SLA da operação.',
      }),
    );
  }

  if (isQueuedJob && !hasQueueFailedHandler) {
    metrics.queueJobsWithoutFailedHandler += 1;
    violations.push(
      createViolation({
        type: 'job-missing-failed-handler',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: 'Job sem handler `failed()` explícito',
        rationale: 'Tratamento de falha explícito melhora observabilidade e compensações.',
        suggestion: 'Considere implementar `failed(Throwable $e)` para fallback/alerta.',
      }),
    );
  }

  if (isQueuedJob && isCriticalQueueJob && !hasQueueUnique) {
    metrics.criticalQueueJobsWithoutUnique += 1;
    violations.push(
      createViolation({
        type: 'critical-job-without-unique',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: 'Job crítico sem `ShouldBeUnique` detectado',
        rationale: 'Fluxos financeiros/estado crítico sem unicidade podem gerar corrida e duplicidade.',
        suggestion: 'Avalie `ShouldBeUnique`/idempotência para evitar processamento duplicado.',
      }),
    );
  }

  if (signals.fileLineCount > threshold(thresholds, 'fatJobLines', 260)) {
    violations.push(
      createViolation({
        type: 'fat-job',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Job com ${signals.fileLineCount} linhas`,
        rationale: 'Jobs extensos tendem a misturar orquestração com regra de domínio.',
        suggestion: 'Extraia passos para Services/Actions reutilizáveis.',
      }),
    );
  }

  const fileBasename = path.basename(relativePath, '.php');
  const hasMatchingTest = testBasenames.has(`${fileBasename}Test`) || testBasenames.has(fileBasename);
  signals.hasTest = hasMatchingTest;
  if (!hasMatchingTest) {
    metrics.missingTests += 1;
    violations.push(
      createViolation({
        type: 'missing-test',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Job ${fileBasename} sem teste dedicado`,
        rationale: 'Jobs concentram fluxos assíncronos com alta chance de regressão.',
        suggestion: `Adicionar teste para ${fileBasename}.`,
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
  analyzeQueryDiscipline({
    relativePath,
    content,
    metrics,
    signals,
    violations,
    sourceKind: 'service',
  });
}

function analyzeListener({ relativePath, content, metrics, signals, violations, testBasenames }) {
  metrics.listeners = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  const isQueuedListener = /implements\s+[^{\n]*ShouldQueue\b/.test(content);
  const hasQueueTrait = /\buse\s+InteractsWithQueue\b/.test(content);
  const hasQueueSignal = isQueuedListener || hasQueueTrait;

  if (!hasQueueSignal && signals.fileLineCount > 140) {
    metrics.listenerWithoutQueue += 1;
    violations.push(
      createViolation({
        type: 'listener-heavy-without-queue',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: 'Listener pesado sem fila detectado',
        rationale: 'Listeners longos síncronos podem adicionar latência no fluxo principal.',
        suggestion: 'Avalie ShouldQueue para processamento assíncrono.',
      }),
    );
  }

  const fileBasename = path.basename(relativePath, '.php');
  const hasMatchingTest = testBasenames.has(`${fileBasename}Test`) || testBasenames.has(fileBasename);
  signals.hasTest = hasMatchingTest;
  if (!hasMatchingTest) {
    metrics.missingTests += 1;
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzeMiddleware({ relativePath, content, metrics, signals, violations, testBasenames, thresholds }) {
  metrics.middlewares = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (signals.fileLineCount > threshold(thresholds, 'fatMiddlewareLines', 180)) {
    metrics.fatMiddlewares = 1;
    violations.push(
      createViolation({
        type: 'fat-middleware',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Middleware com ${signals.fileLineCount} linhas`,
        rationale: 'Middleware extenso tende a concentrar regra de negócio fora da camada esperada.',
        suggestion: 'Mover regra de domínio para services/policies dedicadas.',
      }),
    );
  }

  const modelAliases = collectImportedModelAliases(content);
  const modelCalls = collectModelStaticCalls(content, modelAliases);
  if (modelCalls.length > 0) {
    metrics.middlewaresWithDirectModel = 1;
    violations.push(
      createViolation({
        type: 'middleware-direct-model',
        severity: 'medium',
        file: relativePath,
        line: modelCalls[0].line,
        message: 'Middleware com acesso direto a Model detectado',
        rationale: 'Acesso direto a Model no middleware aumenta acoplamento e reduz previsibilidade do pipeline HTTP.',
        suggestion: 'Delegue a consulta/decisão para service/policy específica.',
      }),
    );
  }

  const fileBasename = path.basename(relativePath, '.php');
  const hasMatchingTest = testBasenames.has(`${fileBasename}Test`) || testBasenames.has(fileBasename);
  signals.hasTest = hasMatchingTest;
  if (!hasMatchingTest) {
    metrics.missingTests += 1;
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzeHelper({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.helpers = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (signals.fileLineCount > threshold(thresholds, 'fatHelperLines', 220)) {
    metrics.fatHelpers = 1;
    violations.push(
      createViolation({
        type: 'fat-helper',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Helper com ${signals.fileLineCount} linhas`,
        rationale: 'Helpers extensos tendem a virar utilitários genéricos difíceis de testar/manter.',
        suggestion: 'Quebre o helper por contexto de domínio ou extraia para services dedicados.',
      }),
    );
  }

  const modelAliases = collectImportedModelAliases(content);
  const modelCalls = collectModelStaticCalls(content, modelAliases);
  if (modelCalls.length > 0) {
    metrics.helpersWithDirectModel = 1;
    violations.push(
      createViolation({
        type: 'helper-direct-model',
        severity: 'medium',
        file: relativePath,
        line: modelCalls[0].line,
        message: 'Helper com acesso direto a Model detectado',
        rationale: 'Helpers com acesso direto a Model aumentam acoplamento transversal e ocultam dependências.',
        suggestion: 'Prefira services/use cases com dependências explícitas em vez de helper global com acesso a dados.',
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzeValidator({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.validators = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (signals.fileLineCount > threshold(thresholds, 'fatValidatorLines', 220)) {
    metrics.fatValidators = 1;
    violations.push(
      createViolation({
        type: 'fat-validator',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Validator com ${signals.fileLineCount} linhas`,
        rationale: 'Validators extensos tendem a misturar regra de validação com fluxo de negócio.',
        suggestion: 'Divida validações por contexto e mantenha contratos de validação objetivos.',
      }),
    );
  }

  const hasEntrypoint = /\bfunction\s+(?:validate|rules|passes)\s*\(/.test(content);
  if (!hasEntrypoint && /\b(?:class|interface)\s+[A-Za-z0-9_]*Validator\b/.test(content)) {
    metrics.validatorsWithoutEntrypoint = 1;
    violations.push(
      createViolation({
        type: 'validator-without-entrypoint',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: 'Validator sem método de entrada esperado detectado',
        rationale: 'Sem entrypoint claro (`validate/rules/passes`) o contrato do validator fica ambíguo.',
        suggestion: 'Defina método de entrada explícito para manter previsibilidade de uso.',
      }),
    );
  }
}

function analyzeException({ content, metrics, signals }) {
  metrics.exceptions = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;
}

function analyzeValueObject({ relativePath, content, metrics, signals, violations }) {
  metrics.valueObjects = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  const hasMutablePublicProperty = /\bpublic\s+(?!readonly\b)(?:static\s+)?(?:\??[A-Za-z0-9_\\|]+\s+)?\$[A-Za-z_][A-Za-z0-9_]*\s*[;=]/.test(
    content,
  );
  const hasSetter = /\bfunction\s+set[A-Z][A-Za-z0-9_]*\s*\(/.test(content);

  if (hasMutablePublicProperty || hasSetter) {
    metrics.mutableValueObjects = 1;
    violations.push(
      createViolation({
        type: 'mutable-value-object',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: 'Value Object com sinais de mutabilidade detectado',
        rationale: 'Value Objects mutáveis reduzem previsibilidade e dificultam consistência de estado.',
        suggestion: 'Prefira Value Objects imutáveis (`readonly`) e construção por construtor/factory.',
      }),
    );
  }
}

function analyzeChannel({ content, metrics, signals }) {
  metrics.channels = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;
}

function analyzeMail({ relativePath, content, metrics, signals, violations }) {
  metrics.mails = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  const isMailable = /\bextends\s+[A-Za-z0-9_\\]*Mailable\b/.test(content);
  const isQueued = /implements\s+[^{\n]*ShouldQueue\b/.test(content);
  if (isMailable && !isQueued) {
    metrics.mailsWithoutQueue = 1;
    violations.push(
      createViolation({
        type: 'mail-without-queue',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: 'Mailable sem `ShouldQueue` detectado',
        rationale: 'Envio síncrono de mail pode aumentar latência e risco de timeout em fluxos com volume.',
        suggestion: 'Avalie `ShouldQueue` para mailables de custo/volume relevante.',
      }),
    );
  }

  if (hasMailSensitivePayload(content)) {
    metrics.mailsWithSensitiveData = 1;
    violations.push(
      createViolation({
        type: 'mail-sensitive-payload',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: 'Mailable com possível payload sensível detectado',
        rationale: 'Dados sensíveis em e-mail aumentam risco de exposição involuntária.',
        suggestion: 'Minimize dados sensíveis no mail e prefira links one-time/token curto com expiração.',
      }),
    );
  }
}

function analyzeLogging({ relativePath, content, metrics, signals, violations }) {
  metrics.loggingClasses = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (hasLogSensitivePayload(content)) {
    metrics.loggingWithSensitiveData = 1;
    violations.push(
      createViolation({
        type: 'logging-sensitive-data',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: 'Possível log de dado sensível detectado',
        rationale: 'Logs com secrets/tokens/passwords ampliam risco de vazamento e compliance.',
        suggestion: 'Mascare/redija dados sensíveis antes de logar e restrinja nível/escopo de logs.',
      }),
    );
  }
}

function analyzeFormComponent({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.formComponents = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (signals.fileLineCount > threshold(thresholds, 'fatFormComponentLines', 260)) {
    metrics.fatFormComponents = 1;
    violations.push(
      createViolation({
        type: 'fat-form-component',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Form component com ${signals.fileLineCount} linhas`,
        rationale: 'Componentes de formulário extensos tendem a concentrar UI + regra de negócio.',
        suggestion: 'Extraia regra de negócio para services/validators e mantenha componente focado em UI.',
      }),
    );
  }
}

function analyzeScope({ relativePath, content, metrics, signals, violations }) {
  metrics.scopes = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (!/\bfunction\s+apply\s*\(/.test(content)) {
    metrics.scopesWithoutApply = 1;
    violations.push(
      createViolation({
        type: 'scope-without-apply',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: 'Scope sem método `apply()` detectado',
        rationale: 'Sem `apply()`, o contrato esperado de scope do Eloquent fica incompleto/ambíguo.',
        suggestion: 'Implemente `apply(Builder $builder, Model $model)` para manter contrato do scope.',
      }),
    );
  }
}

function analyzeKernel({ content, metrics, signals }) {
  metrics.kernels = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;
}

function analyzeWebsocket({ relativePath, content, metrics, signals, violations }) {
  metrics.websocketClasses = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  const hasAuthSignal = /\b(?:auth|authorize|can|gate|token|signature|verify)\b/i.test(content);
  if (!hasAuthSignal) {
    metrics.websocketWithoutAuthSignals = 1;
    violations.push(
      createViolation({
        type: 'websocket-without-auth-signal',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: 'Componente websocket sem sinal claro de autenticação/autorização',
        rationale: 'Fluxos websocket sem controles explícitos elevam risco de acesso indevido a eventos/dados.',
        suggestion: 'Inclua autenticação/autorização explícita no handshake/canal e validação de escopo.',
      }),
    );
  }
}

function analyzeFilamentSupport({ content, metrics, signals }) {
  metrics.filamentSupportFiles = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;
}

function analyzeBroadcasting({ content, metrics, signals }) {
  metrics.broadcastingClasses = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;
}

function analyzeQueueSupport({ content, metrics, signals }) {
  metrics.queueSupportClasses = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;
}

function analyzeProvider({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.providers = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (signals.fileLineCount > threshold(thresholds, 'fatProviderLines', 280)) {
    metrics.fatProviders = 1;
    violations.push(
      createViolation({
        type: 'fat-provider',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Provider com ${signals.fileLineCount} linhas`,
        rationale: 'Providers extensos tendem a acumular responsabilidades de bootstrap e DI.',
        suggestion: 'Extraia bootstrapping por domínio e mantenha providers focados.',
      }),
    );
  }

  const hasBinding = hasContainerBindingSignal(content);
  if (hasBinding) {
    metrics.providersWithContainerBindings = 1;
  }

  const contractImports = collectImports(content).filter((item) => item.fqcn.startsWith('App\\Contracts\\'));
  if (contractImports.length > 0 && !hasBinding) {
    metrics.providersWithContractImportsWithoutBindings = 1;
    violations.push(
      createViolation({
        type: 'provider-contract-import-without-binding',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: 'Provider importa Contracts sem sinal de binding no container',
        rationale: 'Contracts sem bind explícito no provider podem quebrar resolução previsível de dependências.',
        suggestion: 'Registre bindings com bind/singleton/scoped para os contracts importados.',
      }),
    );
  }
}

function analyzeEvent({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.events = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (signals.fileLineCount > threshold(thresholds, 'fatEventLines', 140)) {
    metrics.fatEvents = 1;
    violations.push(
      createViolation({
        type: 'fat-event',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Event com ${signals.fileLineCount} linhas`,
        rationale: 'Events devem ser payloads simples; lógica pesada aumenta acoplamento e side-effects implícitos.',
        suggestion: 'Mantenha events enxutos e mova regra para listeners/services.',
      }),
    );
  }

  const modelAliases = collectImportedModelAliases(content);
  const modelCalls = collectModelStaticCalls(content, modelAliases);
  if (modelCalls.length > 0) {
    metrics.eventsWithDirectModel = 1;
    violations.push(
      createViolation({
        type: 'event-direct-model',
        severity: 'medium',
        file: relativePath,
        line: modelCalls[0].line,
        message: 'Event com acesso direto a Model detectado',
        rationale: 'Events com acesso a Model sugerem mistura de payload com regra de negócio.',
        suggestion: 'Mova consultas/escritas para listener/service e mantenha Event como contrato de dados.',
      }),
    );
  }

  if (hasDbFacadeAccess(content)) {
    metrics.eventsWithDatabaseAccess = 1;
    violations.push(
      createViolation({
        type: 'event-db-access',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: 'Event com acesso direto a DB detectado',
        rationale: 'Acesso direto a DB em Event aumenta side-effects ocultos e dificulta previsibilidade.',
        suggestion: 'Mova acesso a DB para listener/service e mantenha Event apenas como payload.',
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzeObserver({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.observers = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (signals.fileLineCount > threshold(thresholds, 'fatObserverLines', 180)) {
    metrics.fatObservers = 1;
    violations.push(
      createViolation({
        type: 'fat-observer',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Observer com ${signals.fileLineCount} linhas`,
        rationale: 'Observers extensos tendem a concentrar side-effects e dificultam rastreabilidade.',
        suggestion: 'Extraia side-effects complexos para services/listeners especializados.',
      }),
    );
  }

  const modelAliases = collectImportedModelAliases(content);
  const modelCalls = collectModelStaticCalls(content, modelAliases);
  if (modelCalls.length > 0) {
    metrics.observersWithDirectModel = 1;
    violations.push(
      createViolation({
        type: 'observer-direct-model',
        severity: 'low',
        file: relativePath,
        line: modelCalls[0].line,
        message: 'Observer com acesso direto a Model detectado',
        rationale: 'Observers com consultas/escritas diretas tendem a gerar dependências ocultas no lifecycle do Model.',
        suggestion: 'Delegue operações complexas para services e mantenha observer focado em orquestração mínima.',
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
  analyzeQueryDiscipline({
    relativePath,
    content,
    metrics,
    signals,
    violations,
    sourceKind: 'service',
  });
  analyzeCriticalWriteTransaction({ relativePath, content, metrics, signals, violations });
}

function analyzeNotification({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.notifications = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (signals.fileLineCount > threshold(thresholds, 'fatNotificationLines', 180)) {
    metrics.fatNotifications = 1;
    violations.push(
      createViolation({
        type: 'fat-notification',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Notification com ${signals.fileLineCount} linhas`,
        rationale: 'Notifications extensas podem misturar composição de conteúdo com regra de negócio.',
        suggestion: 'Mantenha Notification enxuta e extraia composição complexa para services/mappers.',
      }),
    );
  }

  const hasDeliveryMethods = /\bfunction\s+(?:via|toMail|toArray|toDatabase|toBroadcast)\s*\(/.test(content);
  const isQueuedNotification = /implements\s+[^{\n]*ShouldQueue\b/.test(content);
  if (hasDeliveryMethods && !isQueuedNotification) {
    metrics.notificationsWithoutQueue = 1;
    violations.push(
      createViolation({
        type: 'notification-without-queue',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: 'Notification sem `ShouldQueue` detectada',
        rationale: 'Em fluxos de volume, envio síncrono de notifications pode aumentar latência de resposta.',
        suggestion: 'Avalie implementar `ShouldQueue` para notificações custosas ou de alto volume.',
      }),
    );
  }

  if (hasNotificationSensitivePayload(content)) {
    metrics.notificationsWithSensitiveData = 1;
    violations.push(
      createViolation({
        type: 'notification-sensitive-payload',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: 'Notification com possível payload sensível detectado',
        rationale: 'Exposição de dados sensíveis em canais de notification aumenta risco de vazamento.',
        suggestion: 'Minimize payload sensível e use tokens curtos/one-time com expiração e masking.',
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzeTrait({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.traits = 1;
  signals.fileLineCount = content.split('\n').length;

  const functionBlocks = extractFunctionBlocks(content);
  signals.methodCount = functionBlocks.length;

  if (
    signals.fileLineCount > threshold(thresholds, 'fatTraitLines', 180) ||
    signals.methodCount > threshold(thresholds, 'fatTraitMethods', 10)
  ) {
    metrics.fatTraits = 1;
    violations.push(
      createViolation({
        type: 'fat-trait',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Trait extenso (${signals.fileLineCount} linhas / ${signals.methodCount} métodos)`,
        rationale: 'Traits extensos tendem a concentrar múltiplas responsabilidades e dificultam manutenção.',
        suggestion: 'Quebre o trait em partes menores ou mova regra para service/action dedicada.',
      }),
    );
  }

  const appImports = collectImports(content).filter(
    (item) => item.fqcn.startsWith('App\\') && !item.fqcn.startsWith('App\\Traits\\'),
  );
  if (appImports.length > threshold(thresholds, 'highTraitImports', 8)) {
    metrics.highCouplingTraits = 1;
    violations.push(
      createViolation({
        type: 'trait-high-coupling',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: `Trait com acoplamento alto detectado (${appImports.length} imports de App\\*)`,
        rationale: 'Traits altamente acoplados aumentam dependências implícitas e risco de efeitos colaterais.',
        suggestion: 'Reduza dependências no trait e prefira composições explícitas em serviços.',
      }),
    );
  }

  const modelAliases = collectImportedModelAliases(content);
  const modelCalls = collectModelStaticCalls(content, modelAliases);
  if (modelCalls.length > 0) {
    metrics.traitsWithDirectModel = 1;
    violations.push(
      createViolation({
        type: 'trait-direct-model',
        severity: 'medium',
        file: relativePath,
        line: modelCalls[0].line,
        message: 'Trait com acesso direto a Model detectado',
        rationale: 'Acesso direto a Model em trait cria acoplamento transversal e dificulta previsibilidade.',
        suggestion: 'Delegue consultas/escritas para service/use case chamado pelo ponto de uso do trait.',
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzeContract({ relativePath, content, metrics, signals, violations, analysisContext }) {
  metrics.contracts = 1;
  signals.fileLineCount = content.split('\n').length;

  const interfaceMatch = content.match(/\binterface\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (!interfaceMatch) {
    return;
  }

  const contractName = interfaceMatch[1];
  if (!contractName.endsWith('Interface')) {
    return;
  }

  const hasBinding = analysisContext?.boundContracts?.has(contractName);
  if (hasBinding) {
    metrics.contractsWithContainerBinding = 1;
    return;
  }

  metrics.contractsWithoutContainerBinding = 1;
  violations.push(
    createViolation({
      type: 'contract-without-container-binding',
      severity: 'low',
      file: relativePath,
      line: lineFromIndex(content, interfaceMatch.index),
      message: `Contrato ${contractName} sem bind/singleton/scoped detectado`,
      rationale: 'Interfaces sem binding explícito no container podem causar resolução inconsistente entre ambientes.',
      suggestion: 'Registre o contrato em provider com `bind`, `singleton` ou `scoped`.',
    }),
  );
}

function analyzeHttpResource({ relativePath, content, metrics, signals, violations }) {
  metrics.httpResources = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  const relationAccesses = collectResourceRelationAccesses(content);
  const guardedRelations = collectResourceGuardedRelations(content);
  const hasWhenLoaded = /\bwhenLoaded\s*\(/.test(content);

  signals.hasWhenLoaded = hasWhenLoaded;
  signals.resourceRelationAccesses = relationAccesses;

  if (hasWhenLoaded) {
    metrics.httpResourcesUsingWhenLoaded = 1;
  }

  const riskyAccesses = relationAccesses.filter((item) => !guardedRelations.has(item.relation));
  if (riskyAccesses.length > 0) {
    metrics.httpResourcesWithoutWhenLoaded = 1;
    metrics.httpResourceRelationsWithoutWhenLoaded += riskyAccesses.length;
    violations.push(
      createViolation({
        type: 'resource-relation-without-whenloaded',
        severity: 'medium',
        file: relativePath,
        line: riskyAccesses[0].line,
        message: `${riskyAccesses.length} acesso(s) de relação em Resource sem guardas explícitas`,
        rationale: 'Acesso direto de relação em Resource pode disparar lazy loading e risco de N+1.',
        suggestion: 'Use `whenLoaded()`/`whenCounted()` (ou `relationLoaded`) para relações opcionais em Resources.',
      }),
    );
  }
}

function analyzeModel({ relativePath, content, metrics, signals, violations, testBasenames, thresholds }) {
  metrics.models = 1;
  signals.fileLineCount = content.split('\n').length;

  const methodCount = extractFunctionBlocks(content).length;
  signals.methodCount = methodCount;

  if (
    signals.fileLineCount > threshold(thresholds, 'fatModelLines', 320) ||
    methodCount > threshold(thresholds, 'fatModelMethods', 15)
  ) {
    metrics.fatModels = 1;
    violations.push(
      createViolation({
        type: 'fat-model',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: `Model com ${signals.fileLineCount} linhas e ${methodCount} métodos`,
        rationale: 'Model pesado tende a concentrar regra demais e difícil reuso/teste.',
        suggestion: 'Extrair regras para Services/UseCases/DTOs conforme contexto.',
      }),
    );
  }

  const fileBasename = path.basename(relativePath, '.php');
  const hasMatchingTest = testBasenames.has(`${fileBasename}Test`) || testBasenames.has(fileBasename);
  signals.hasTest = hasMatchingTest;
  if (!hasMatchingTest) {
    metrics.missingTests += 1;
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
  analyzeQueryDiscipline({
    relativePath,
    content,
    metrics,
    signals,
    violations,
    sourceKind: 'command',
  });
  analyzeCriticalWriteTransaction({ relativePath, content, metrics, signals, violations });
}

function analyzePolicy({ content, metrics, signals }) {
  metrics.policies = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;
}

function analyzeEnum({ content, metrics, signals }) {
  metrics.enums = 1;
  signals.fileLineCount = content.split('\n').length;
}

function analyzeDto({ content, metrics, signals }) {
  metrics.dtos = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;
}

function analyzeCommand({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.commands = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (signals.fileLineCount > threshold(thresholds, 'fatCommandLines', 260)) {
    metrics.fatCommands = 1;
    violations.push(
      createViolation({
        type: 'fat-command',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: `Command com ${signals.fileLineCount} linhas`,
        rationale: 'Commands longos tendem a concentrar fluxo operacional e dificultar manutenção.',
        suggestion: 'Extrair passos para Services/Actions reutilizáveis.',
      }),
    );
  }

  const modelAliases = collectImportedModelAliases(content);
  const modelCalls = collectModelStaticCalls(content, modelAliases);
  modelCalls
    .filter((item) => item.method === 'all')
    .forEach((call) => {
      metrics.modelAllCallsInCommand += 1;
      signals.modelAllCalls.push(call);
      violations.push(
        createViolation({
          type: 'model-all-in-command',
          severity: 'medium',
          file: relativePath,
          line: call.line,
          message: `Command usando ${call.className}::all()`,
          rationale: 'Carga total de registros em command pode gerar memória alta e execução lenta.',
          suggestion: 'Prefira chunking/lazy collections ou queries paginadas.',
        }),
      );
    });

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzeFilamentResource({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.filamentResources = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;

  if (
    signals.fileLineCount > threshold(thresholds, 'fatFilamentResourceLines', 320) ||
    signals.methodCount > threshold(thresholds, 'fatFilamentResourceMethods', 12)
  ) {
    metrics.fatFilamentResources = 1;
    violations.push(
      createViolation({
        type: 'fat-filament-resource',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Filament Resource extenso (${signals.fileLineCount} linhas / ${signals.methodCount} métodos)`,
        rationale: 'Resources muito extensos tendem a misturar UI config com regra de negócio.',
        suggestion: 'Extrair regras para Services/Policies e simplificar configuração da Resource.',
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzeFilamentPage({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.filamentPages = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;
  signals.hasFilamentPageAuth = hasFilamentPageAuthorizationSignal(content);

  if (signals.hasFilamentPageAuth) {
    metrics.filamentPagesWithAuth = 1;
  } else {
    violations.push(
      createViolation({
        type: 'filament-page-missing-authz',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: 'Filament Page sem sinal explícito de controle de acesso',
        rationale: 'Pages podem ser acessadas por URL direta; sem guardas explícitas aumenta risco de exposição indevida.',
        suggestion: 'Considere `canAccess()`/policy/authorize no fluxo da Page.',
      }),
    );
  }

  if (signals.fileLineCount > threshold(thresholds, 'fatFilamentResourceLines', 320)) {
    metrics.fatFilamentPages = 1;
    violations.push(
      createViolation({
        type: 'fat-filament-page',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Filament Page extensa (${signals.fileLineCount} linhas)`,
        rationale: 'Pages extensas tendem a acumular fluxo de UI e regra de negócio.',
        suggestion: 'Extrair lógica para Services/Actions e reduzir responsabilidade da Page.',
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzeFilamentWidget({ relativePath, content, metrics, signals, violations, thresholds }) {
  metrics.filamentWidgets = 1;
  signals.fileLineCount = content.split('\n').length;
  signals.methodCount = extractFunctionBlocks(content).length;
  signals.hasFilamentWidgetAuth = hasFilamentWidgetAuthorizationSignal(content);

  if (signals.hasFilamentWidgetAuth) {
    metrics.filamentWidgetsWithAuth = 1;
  } else {
    violations.push(
      createViolation({
        type: 'filament-widget-missing-authz',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: 'Filament Widget sem sinal explícito de visibilidade/autorização',
        rationale: 'Widgets podem expor dados sensíveis no painel sem checagem explícita de visibilidade.',
        suggestion: 'Considere implementar `canView()` e/ou autorização server-side.',
      }),
    );
  }

  if (signals.fileLineCount > threshold(thresholds, 'fatFilamentResourceLines', 320)) {
    metrics.fatFilamentWidgets = 1;
    violations.push(
      createViolation({
        type: 'fat-filament-widget',
        severity: 'low',
        file: relativePath,
        line: 1,
        message: `Filament Widget extenso (${signals.fileLineCount} linhas)`,
        rationale: 'Widgets extensos podem concentrar consulta/transformação além da responsabilidade de apresentação.',
        suggestion: 'Mover preparação de dados para camada de serviço e simplificar o Widget.',
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzeRouteFile({ relativePath, content, metrics, signals, violations }) {
  metrics.routeFiles = 1;

  const hasStateChangingRoute = /\bRoute::(?:post|put|patch|delete)\s*\(/.test(content);
  const hasAuth = /\bauth(?::|['"])/i.test(content);
  const hasThrottle = /\bthrottle(?::|['"])/i.test(content) || /\bRateLimiter::/i.test(content);
  const hasWithoutCsrf = /\bwithoutMiddleware\s*\(\s*(?:[^)]*VerifyCsrfToken::class|['"]csrf['"])/i.test(content);

  signals.hasStateChangingRoute = hasStateChangingRoute;
  signals.hasRouteAuth = hasAuth;
  signals.hasRouteThrottle = hasThrottle;
  signals.hasRouteWithoutCsrf = hasWithoutCsrf;

  if (hasAuth) {
    metrics.routeFilesWithAuth = 1;
  }

  if (hasThrottle) {
    metrics.routeFilesWithThrottle = 1;
  }

  if (hasStateChangingRoute && !hasAuth) {
    metrics.stateChangingRouteFilesWithoutAuth = 1;
    violations.push(
      createViolation({
        type: 'state-route-without-auth',
        severity: 'high',
        file: relativePath,
        line: 1,
        message: 'Arquivo de rotas state-changing sem evidência de middleware auth',
        rationale: 'Endpoints de escrita sem autenticação explícita elevam risco de bypass/autorização indevida.',
        suggestion: 'Aplique middleware auth/policy em rotas de escrita e confirme escopo tenant.',
      }),
    );
  }

  if (hasStateChangingRoute && !hasThrottle) {
    metrics.stateChangingRouteFilesWithoutThrottle = 1;
    violations.push(
      createViolation({
        type: 'state-route-without-throttle',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: 'Arquivo de rotas state-changing sem evidência de throttle/rate limiter',
        rationale: 'Ausência de throttling em rotas de escrita aumenta risco de brute force/abuso.',
        suggestion: 'Defina throttle por endpoint/ator para rotas críticas.',
      }),
    );
  }

  if (hasStateChangingRoute && hasWithoutCsrf) {
    metrics.routeFilesWithoutCsrf = 1;
    violations.push(
      createViolation({
        type: 'state-route-without-csrf',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: 'Rotas state-changing com bypass explícito de CSRF detectado',
        rationale: 'Bypass de CSRF em rotas de escrita exige justificativa forte e escopo restrito.',
        suggestion: 'Revisar necessidade de bypass e garantir compensações (auth, signed URL, nonce).',
      }),
    );
  }
}

function analyzeLivewireComponent({ relativePath, content, metrics, signals, violations }) {
  metrics.livewireComponents = 1;
  signals.fileLineCount = content.split('\n').length;

  const publicProps = Array.from(content.matchAll(/\bpublic\s+(?:\??[A-Za-z0-9_\\|]+\s+)?\$[A-Za-z0-9_]+/g)).length;
  const lockedProps = Array.from(content.matchAll(/#\[\s*Locked(?:\s*\([^\)]*\))?\s*\]/g)).length;

  metrics.livewirePublicProperties += publicProps;
  metrics.livewireLockedProperties += lockedProps;
  signals.livewirePublicPropertyCount = publicProps;
  signals.livewireLockedPropertyCount = lockedProps;

  if (publicProps > 0 && lockedProps === 0) {
    violations.push(
      createViolation({
        type: 'livewire-unlocked-public-properties',
        severity: 'medium',
        file: relativePath,
        line: 1,
        message: 'Componente Livewire com propriedades públicas sem lock detectado',
        rationale: 'Propriedades públicas são superfície de input e podem sofrer tampering se não controladas.',
        suggestion: 'Avalie `#[Locked]`, validação defensiva e autorização em cada mutação/action.',
      }),
    );
  }

  analyzeDynamicRawSql({ relativePath, content, metrics, signals, violations });
}

function analyzePhpFile({ relativePath, absolutePath, content, testBasenames, thresholds = {}, analysisContext = {} }) {
  const metrics = createMetrics();
  const signals = createSignals();
  const violations = [];
  const kind = detectKind(relativePath, content);

  if (kind === 'controller') {
    analyzeController({ relativePath, content, metrics, signals, violations, testBasenames, thresholds });
  } else if (kind === 'service') {
    analyzeService({ relativePath, content, metrics, signals, violations, testBasenames, thresholds });
  } else if (kind === 'job') {
    analyzeJob({ relativePath, content, metrics, signals, violations, testBasenames, thresholds });
  } else if (kind === 'listener') {
    analyzeListener({ relativePath, content, metrics, signals, violations, testBasenames });
  } else if (kind === 'middleware') {
    analyzeMiddleware({ relativePath, content, metrics, signals, violations, testBasenames, thresholds });
  } else if (kind === 'helper') {
    analyzeHelper({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'validator') {
    analyzeValidator({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'exception') {
    analyzeException({ content, metrics, signals });
  } else if (kind === 'value-object') {
    analyzeValueObject({ relativePath, content, metrics, signals, violations });
  } else if (kind === 'channel') {
    analyzeChannel({ content, metrics, signals });
  } else if (kind === 'mail') {
    analyzeMail({ relativePath, content, metrics, signals, violations });
  } else if (kind === 'logging') {
    analyzeLogging({ relativePath, content, metrics, signals, violations });
  } else if (kind === 'form-component') {
    analyzeFormComponent({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'scope') {
    analyzeScope({ relativePath, content, metrics, signals, violations });
  } else if (kind === 'kernel') {
    analyzeKernel({ content, metrics, signals });
  } else if (kind === 'websocket') {
    analyzeWebsocket({ relativePath, content, metrics, signals, violations });
  } else if (kind === 'filament-support') {
    analyzeFilamentSupport({ content, metrics, signals });
  } else if (kind === 'broadcasting') {
    analyzeBroadcasting({ content, metrics, signals });
  } else if (kind === 'queue-support') {
    analyzeQueueSupport({ content, metrics, signals });
  } else if (kind === 'provider') {
    analyzeProvider({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'event') {
    analyzeEvent({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'observer') {
    analyzeObserver({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'notification') {
    analyzeNotification({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'trait') {
    analyzeTrait({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'contract') {
    analyzeContract({ relativePath, content, metrics, signals, violations, analysisContext });
  } else if (kind === 'http-resource') {
    analyzeHttpResource({ relativePath, content, metrics, signals, violations });
  } else if (kind === 'command') {
    analyzeCommand({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'filament-resource') {
    analyzeFilamentResource({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'filament-page') {
    analyzeFilamentPage({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'filament-widget') {
    analyzeFilamentWidget({ relativePath, content, metrics, signals, violations, thresholds });
  } else if (kind === 'route-file') {
    analyzeRouteFile({ relativePath, content, metrics, signals, violations });
  } else if (kind === 'livewire-component') {
    analyzeLivewireComponent({ relativePath, content, metrics, signals, violations });
  } else if (kind === 'model') {
    analyzeModel({ relativePath, content, metrics, signals, violations, testBasenames, thresholds });
  } else if (kind === 'policy') {
    analyzePolicy({ content, metrics, signals });
  } else if (kind === 'enum') {
    analyzeEnum({ content, metrics, signals });
  } else if (kind === 'dto') {
    analyzeDto({ content, metrics, signals });
  }

  analyzeCommonSecuritySignals({
    content,
    metrics,
    signals,
  });
  analyzeDangerousSinks({
    relativePath,
    content,
    metrics,
    signals,
    violations,
  });

  return {
    file: relativePath,
    absolutePath,
    kind,
    metrics,
    signals,
    violations,
  };
}

function analyzeFiles({ files, root, testBasenames, thresholds = {} }) {
  const perFile = {};
  const analysisContext = createAnalysisContext(root);

  for (const absolutePath of files) {
    if (!absolutePath.endsWith('.php') || !fs.existsSync(absolutePath)) {
      continue;
    }

    const relativePath = normalizePath(path.relative(root, absolutePath));
    const content = fs.readFileSync(absolutePath, 'utf8');

    perFile[relativePath] = analyzePhpFile({
      relativePath,
      absolutePath,
      content,
      testBasenames,
      thresholds,
      analysisContext,
    });
  }

  return perFile;
}

module.exports = {
  ANALYZER_VERSION,
  analyzeFiles,
};
