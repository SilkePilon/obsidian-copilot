import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { SettingItem } from "@/components/ui/setting-item";
import { SettingSwitch } from "@/components/ui/setting-switch";
import { ToolRegistry } from "@/tools/ToolRegistry";
import { updateSetting, useSettingsValue } from "@/settings/model";
import { WEB_SEARCH_PROVIDERS, DEFAULT_WEB_SEARCH_PROVIDER } from "@/tools/providers/WebSearchProvider";
import { WebSearchConfigDialog } from "./WebSearchConfigDialog";
import { Settings, TriangleAlert } from "lucide-react";

function isWebSearchConfigured(settings: { 
  webSearchProvider: string; 
  webSearchApiKey: string; 
  webSearchApiKeys?: Record<string, string>;
  webSearchBaseUrl: string;
}): boolean {
  const providerKey = settings.webSearchProvider || DEFAULT_WEB_SEARCH_PROVIDER;
  const provider = WEB_SEARCH_PROVIDERS[providerKey];
  
  if (!provider) return false;
  
  if (providerKey === "searxng") {
    return !!settings.webSearchBaseUrl?.trim();
  }
  
  if (provider.requiresApiKey) {
    const apiKey = settings.webSearchApiKeys?.[providerKey] || settings.webSearchApiKey || "";
    return !!apiKey.trim();
  }
  
  return true;
}

export const ToolSettingsSection: React.FC = () => {
  const settings = useSettingsValue();
  const registry = ToolRegistry.getInstance();
  const [webSearchDialogOpen, setWebSearchDialogOpen] = useState(false);
  const enabledToolIds = new Set(settings.autonomousAgentEnabledToolIds || []);

  let toolsByCategory: Map<string, any[]>;
  let configurableTools: any[];
  
  try {
    toolsByCategory = registry.getToolsByCategory();
    configurableTools = registry.getConfigurableTools();
  } catch (e) {
    toolsByCategory = new Map();
    configurableTools = [];
  }

  const webSearchConfigured = isWebSearchConfigured(settings);
  const prevWebSearchConfigured = useRef(webSearchConfigured);

  useEffect(() => {
    if (!prevWebSearchConfigured.current && webSearchConfigured) {
      const newEnabledIds = new Set(settings.autonomousAgentEnabledToolIds || []);
      newEnabledIds.add("webSearch");
      updateSetting("autonomousAgentEnabledToolIds", Array.from(newEnabledIds));
    }
    prevWebSearchConfigured.current = webSearchConfigured;
  }, [webSearchConfigured, settings.autonomousAgentEnabledToolIds]);

  const handleToolToggle = (toolId: string, enabled: boolean) => {
    const newEnabledIds = new Set(enabledToolIds);
    if (enabled) {
      newEnabledIds.add(toolId);
    } else {
      newEnabledIds.delete(toolId);
    }
    updateSetting("autonomousAgentEnabledToolIds", Array.from(newEnabledIds));
  };

  const renderToolsByCategory = () => {
    const categories = Array.from(toolsByCategory.entries()).filter(([_, tools]) =>
      tools.some((t) => configurableTools.includes(t))
    );

    return categories.map(([category, tools]) => {
      const configurableInCategory = tools.filter((t) => configurableTools.includes(t));

      if (configurableInCategory.length === 0) return null;

      return (
        <React.Fragment key={category}>
          {configurableInCategory.map(({ metadata }) => {
            // Handle Web Search tool
            if (metadata.id === "webSearch") {
              return (
                <div
                  key={metadata.id}
                  className="tw-flex tw-items-start tw-justify-between tw-gap-2 tw-py-2"
                >
                  <div className="tw-flex tw-flex-1 tw-flex-col tw-gap-1">
                    <div className="tw-flex tw-items-center tw-gap-2">
                      <span className="tw-text-sm tw-font-medium">{metadata.displayName}</span>
                      {!webSearchConfigured && (
                        <span className="tw-inline-flex tw-items-center">
                          <HelpTooltip content="Web search provider not configured. Click Configure to set up." side="bottom">
                            <TriangleAlert className="tw-size-4 tw-text-warning" />
                          </HelpTooltip>
                        </span>
                      )}
                    </div>
                    <span className="tw-text-xs tw-text-muted">{metadata.description}</span>
                  </div>
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setWebSearchDialogOpen(true)}
                      className="tw-h-7 tw-gap-1 tw-px-2 tw-text-xs"
                    >
                      <Settings className="tw-size-3" />
                      Configure
                    </Button>
                    <div className="tw-h-5 tw-w-px tw-bg-[var(--background-modifier-border)]" />
                    <SettingSwitch
                      checked={webSearchConfigured && enabledToolIds.has(metadata.id)}
                      onCheckedChange={(checked) => handleToolToggle(metadata.id, checked)}
                      disabled={!webSearchConfigured}
                    />
                  </div>
                </div>
              );
            }

            // Regular tools
            return (
              <SettingItem
                key={metadata.id}
                type="switch"
                title={metadata.displayName}
                description={metadata.description}
                checked={enabledToolIds.has(metadata.id)}
                onCheckedChange={(checked) => handleToolToggle(metadata.id, checked)}
              />
            );
          })}
        </React.Fragment>
      );
    });
  };

  return (
    <>
      <SettingItem
        type="slider"
        title="Max Iterations"
        description="Maximum number of reasoning iterations the autonomous agent can perform. Higher values allow for more complex reasoning but may take longer."
        value={settings.autonomousAgentMaxIterations ?? 4}
        onChange={(value) => {
          updateSetting("autonomousAgentMaxIterations", value);
        }}
        min={4}
        max={8}
        step={1}
      />

      <div className="tw-mt-4 tw-rounded-lg tw-bg-secondary tw-p-4">
        <div className="tw-mb-2 tw-text-sm tw-font-medium">Agent Accessible Tools</div>
        <div className="tw-mb-4 tw-text-xs tw-text-muted">
          Toggle which tools the autonomous agent can use
        </div>
        <div className="tw-flex tw-flex-col tw-gap-2">{renderToolsByCategory()}</div>
      </div>

      {webSearchDialogOpen && (
        <WebSearchConfigDialog open={webSearchDialogOpen} onOpenChange={setWebSearchDialogOpen} />
      )}
    </>
  );
};
