import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { SettingItem } from "@/components/ui/setting-item";
import { SettingSwitch } from "@/components/ui/setting-switch";
import { ToolRegistry } from "@/tools/ToolRegistry";
import { updateSetting, useSettingsValue } from "@/settings/model";
import { WEB_SEARCH_PROVIDERS, DEFAULT_WEB_SEARCH_PROVIDER } from "@/tools/providers/WebSearchProvider";
import { WebSearchConfigModal } from "./WebSearchConfigDialog";
import { VaultSearchExclusionModal } from "@/components/modals/PatternMatchingModal";
import { Settings, TriangleAlert, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Category display names
const CATEGORY_NAMES: Record<string, string> = {
  search: "Search",
  file: "File Editing",
  time: "Time",
  media: "Media",
  memory: "Memory",
  mcp: "MCP",
  custom: "Custom",
  graph: "Graph & Links",
  bookmark: "Bookmarks",
  canvas: "Canvas"
};

// Categories that should be collapsible
const COLLAPSIBLE_CATEGORIES = new Set(["file", "graph", "bookmark", "canvas"]);

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
  const enabledToolIds = new Set(settings.autonomousAgentEnabledToolIds || []);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

  const handleCategoryToggle = (category: string, enabled: boolean) => {
    const tools = toolsByCategory.get(category) || [];
    const newEnabledIds = new Set(enabledToolIds);
    
    tools.forEach((toolDef) => {
      const { metadata } = toolDef;
      if (!metadata.isAlwaysEnabled && configurableTools.includes(toolDef)) {
        if (enabled) {
          newEnabledIds.add(metadata.id);
        } else {
          newEnabledIds.delete(metadata.id);
        }
      }
    });
    
    updateSetting("autonomousAgentEnabledToolIds", Array.from(newEnabledIds));
  };

  const toggleCategoryExpansion = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const isCategoryEnabled = (category: string): boolean => {
    const tools = toolsByCategory.get(category) || [];
    const configurableInCategory = tools.filter((t) => 
      configurableTools.includes(t) && !t.metadata.isAlwaysEnabled
    );
    
    if (configurableInCategory.length === 0) return false;
    
    return configurableInCategory.every((toolDef) => enabledToolIds.has(toolDef.metadata.id));
  };

  const renderToolsByCategory = () => {
    const categories = Array.from(toolsByCategory.entries()).filter(([_, tools]) =>
      tools.some((t) => configurableTools.includes(t))
    );

    const elements: JSX.Element[] = [];

    categories.forEach(([category, tools]) => {
      const configurableInCategory = tools.filter((t) => configurableTools.includes(t));

      if (configurableInCategory.length === 0) return;

      // Check if this category should be collapsible
      if (COLLAPSIBLE_CATEGORIES.has(category)) {
        const isExpanded = expandedCategories.has(category);
        const categoryEnabled = isCategoryEnabled(category);
        const categoryName = CATEGORY_NAMES[category] || category;
        
        // Collapsible category header
        elements.push(
          <div
            key={`${category}-group`}
            className="tw-flex tw-items-start tw-justify-between tw-gap-2 tw-py-2"
          >
            <div className="tw-flex tw-flex-1 tw-flex-col tw-gap-1">
              <span className="tw-text-sm tw-font-medium">{categoryName}</span>
              <span className="tw-text-xs tw-text-muted">
                {category === "file" && "Create, read, and modify files in your vault"}
                {category === "graph" && "Analyze note relationships and vault structure"}
                {category === "bookmark" && "Access and manage bookmarked notes"}
                {category === "canvas" && "Create and manipulate canvas files with nodes and connections"}
              </span>
            </div>
            <div className="tw-flex tw-items-center tw-gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toggleCategoryExpansion(category)}
                className="tw-h-7 tw-w-7 tw-p-0"
              >
                <ChevronRight 
                  className={cn(
                    "tw-size-4 tw-transition-transform tw-duration-200",
                    isExpanded && "tw-rotate-90"
                  )}
                />
              </Button>
              <div className="tw-h-5 tw-w-px tw-bg-[var(--background-modifier-border)]" />
              <SettingSwitch
                checked={categoryEnabled}
                onCheckedChange={(checked) => handleCategoryToggle(category, checked)}
              />
            </div>
          </div>
        );

        // Individual tools in category (when expanded)
        elements.push(
          <div
            key={`${category}-tools-container`}
            className="tw-overflow-hidden tw-transition-all tw-duration-300 tw-ease-in-out"
            style={{
              maxHeight: isExpanded ? `${configurableInCategory.length * 80}px` : '0px',
              opacity: isExpanded ? 1 : 0,
            }}
          >
            {configurableInCategory.map(({ metadata }) => (
              <div
                key={metadata.id}
                className="tw-flex tw-items-start tw-justify-between tw-gap-2 tw-py-2 tw-pl-10"
              >
                <div className="tw-flex tw-flex-1 tw-flex-col tw-gap-1">
                  <span className="tw-text-sm">{metadata.displayName}</span>
                  <span className="tw-text-xs tw-text-muted">{metadata.description}</span>
                </div>
                <SettingSwitch
                  checked={enabledToolIds.has(metadata.id)}
                  onCheckedChange={(checked) => handleToolToggle(metadata.id, checked)}
                />
              </div>
            ))}
          </div>
        );
      } else {
        // Regular non-collapsible tools
        configurableInCategory.forEach(({ metadata }) => {
          // Handle Web Search tool
          if (metadata.id === "webSearch") {
            elements.push(
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
                    onClick={() => {
                      const keys = { ...(settings.webSearchApiKeys || {}) };
                      const currentProvider = settings.webSearchProvider || DEFAULT_WEB_SEARCH_PROVIDER;
                      if (settings.webSearchApiKey && !keys[currentProvider]) {
                        keys[currentProvider] = settings.webSearchApiKey;
                      }
                      new WebSearchConfigModal(
                        app,
                        currentProvider,
                        keys,
                        settings.webSearchBaseUrl || ""
                      ).open();
                    }}
                    className="tw-h-7 tw-w-7 tw-p-0"
                  >
                    <Settings className="tw-size-4" />
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
            return;
          }

          // Handle Vault Search tool (localSearch)
          if (metadata.id === "localSearch") {
            elements.push(
              <div
                key={metadata.id}
                className="tw-flex tw-items-start tw-justify-between tw-gap-2 tw-py-2"
              >
                <div className="tw-flex tw-flex-1 tw-flex-col tw-gap-1">
                  <span className="tw-text-sm tw-font-medium">{metadata.displayName}</span>
                  <span className="tw-text-xs tw-text-muted">{metadata.description}</span>
                </div>
                <div className="tw-flex tw-items-center tw-gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      new VaultSearchExclusionModal(
                        app,
                        (paths) => updateSetting("vaultSearchExcludedPaths", paths),
                        settings.vaultSearchExcludedPaths || []
                      ).open();
                    }}
                    className="tw-h-7 tw-w-7 tw-p-0"
                  >
                    <Settings className="tw-size-4" />
                  </Button>
                  <div className="tw-h-5 tw-w-px tw-bg-[var(--background-modifier-border)]" />
                  <SettingSwitch
                    checked={enabledToolIds.has(metadata.id)}
                    onCheckedChange={(checked) => handleToolToggle(metadata.id, checked)}
                  />
                </div>
              </div>
            );
            return;
          }

          // Regular tools
          elements.push(
            <SettingItem
              key={metadata.id}
              type="switch"
              title={metadata.displayName}
              description={metadata.description}
              checked={enabledToolIds.has(metadata.id)}
              onCheckedChange={(checked) => handleToolToggle(metadata.id, checked)}
            />
          );
        });
      }
    });

    return elements;
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

      <SettingItem
        type="switch"
        title="Skip Review"
        description="Automatically apply file changes without requiring user confirmation. Use with caution as this allows the AI to modify your vault directly."
        checked={settings.autonomousAgentSkipReview ?? false}
        onCheckedChange={(checked) => {
          updateSetting("autonomousAgentSkipReview", checked);
        }}
      />

      <div className="tw-mt-4 tw-rounded-lg tw-bg-secondary tw-p-4">
        <div className="tw-mb-2 tw-text-sm tw-font-medium">Agent Accessible Tools</div>
        <div className="tw-mb-4 tw-text-xs tw-text-muted">
          Toggle which tools the autonomous agent can use
        </div>
        <div className="tw-flex tw-flex-col tw-gap-2">{renderToolsByCategory()}</div>
      </div>
    </>
  );
};
