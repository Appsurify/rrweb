declare let pluginConfig: {
    outputUIReportDir: string;
    includeHtml: boolean;
    compress: boolean;
    upload: boolean;
    uploadUrl: string;
    projectId: string;
    apiKey: string;
};
export default function registerRRWebReportTasks(on: Cypress.PluginEvents, config?: Partial<typeof pluginConfig>): void;
export {};
