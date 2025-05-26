"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = registerRRWebReportTasks;
const path = __importStar(require("path"));
const rrweb_ui_report_1 = __importDefault(require("@appsurify-testmap/rrweb-ui-report"));
let pluginConfig = {
    outputUIReportDir: 'results/ui',
    includeHtml: false,
    compress: false,
    upload: false,
    uploadUrl: '',
    projectId: '',
    apiKey: ''
};
function sanitizeFileNamePart(name) {
    return (name ?? '')
        .trim()
        .replace(/[\s:/\\<>|"'?*]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
function registerRRWebReportTasks(on, config) {
    pluginConfig = { ...pluginConfig, ...config };
    on('task', {
        saveRRWebReport(testRunResult) {
            console.log('[rrweb-cypress-plugin] registering saveRRWebReport task', testRunResult);
            console.log("HERE #1.0");
            const specName = sanitizeFileNamePart(testRunResult.spec.name);
            const suiteTitle = sanitizeFileNamePart(testRunResult.test.suite?.title);
            const testTitle = sanitizeFileNamePart(testRunResult.test.title);
            console.log("HERE #1.1", {
                specName,
                testTitle,
                suiteTitle,
            });
            console.log("HERE #2.0");
            console.log("HERE #2.1", specName);
            const jsonFileName = `${suiteTitle ? suiteTitle + '-' : ''}${testTitle}.json`;
            console.log("HERE #2.3", jsonFileName);
            console.log("HERE #2.31", {
                outputUIReportDir: pluginConfig.outputUIReportDir, specName, jsonFileName
            });
            console.log("HERE #2.4", typeof path);
            console.log("typeof path.join", typeof path.join);
            console.log('HERE #2.5', typeof rrweb_ui_report_1.default);
            console.log('HERE #2.6', rrweb_ui_report_1.default);
            console.log("HERE #3");
            console.log("HERE #4");
            return null;
        }
    });
}
//# sourceMappingURL=reporter.js.map