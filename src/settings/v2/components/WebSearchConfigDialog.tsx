import { App, Modal, Notice } from "obsidian";
import React, { useState, useEffect } from "react";
import { createRoot, Root } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateSetting } from "@/settings/model";
import {
  WEB_SEARCH_PROVIDERS,
  DEFAULT_WEB_SEARCH_PROVIDER,
} from "@/tools/providers/WebSearchProvider";
import { ExternalLink } from "lucide-react";

interface WebSearchConfigModalContentProps {
  initialProvider: string;
  initialApiKeys: Record<string, string>;
  initialBaseUrl: string;
  onSave: (provider: string, apiKeys: Record<string, string>, baseUrl: string) => void;
  onCancel: () => void;
  container: HTMLElement;
}

function WebSearchConfigModalContent({
  initialProvider,
  initialApiKeys,
  initialBaseUrl,
  onSave,
  onCancel,
  container,
}: WebSearchConfigModalContentProps) {
  const [provider, setProvider] = useState(initialProvider);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(initialApiKeys);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [dialogElement, setDialogElement] = useState<HTMLDivElement | null>(null);

  const selectedProvider = WEB_SEARCH_PROVIDERS[provider];
  const currentApiKey = apiKeys[provider] || "";

  const handleApiKeyChange = (value: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: value }));
  };

  return (
    <div className="tw-flex tw-flex-col tw-gap-4" ref={(el) => setDialogElement(el)}>
      <div className="tw-text-sm tw-text-muted">
        Configure how Copilot searches the web for information.
      </div>

      <div className="tw-space-y-4">
        <FormField
          label="Web Search Provider"
          description={selectedProvider?.description || "Select a provider for web search"}
        >
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger>
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent container={dialogElement || container}>
              {Object.entries(WEB_SEARCH_PROVIDERS).map(([key, providerInfo]) => (
                <SelectItem key={key} value={key}>
                  {providerInfo.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {selectedProvider?.requiresApiKey && (
          <div className="tw-space-y-2">
            <FormField
              label="Web Search API Key"
              description={`API key for ${selectedProvider.displayName}.`}
            >
              <Input
                type="password"
                placeholder="Enter your API key"
                value={currentApiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
              />
            </FormField>
            {selectedProvider.apiKeyUrl && (
              <p className="tw-text-xs tw-text-muted">
                <a
                  href={selectedProvider.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tw-inline-flex tw-items-center tw-gap-1 tw-text-accent hover:tw-underline"
                >
                  Get API key <ExternalLink className="tw-size-3" />
                </a>
              </p>
            )}
          </div>
        )}

        {provider === "searxng" && (
          <FormField
            label="SearXNG Base URL"
            description="The URL of your self-hosted SearXNG instance (e.g., https://search.example.com)"
          >
            <Input
              type="text"
              placeholder="https://search.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </FormField>
        )}

        {!selectedProvider?.requiresApiKey && provider !== "searxng" && (
          <div className="tw-flex tw-items-center tw-gap-2 tw-rounded tw-bg-secondary tw-p-3">
            <span className="tw-text-sm tw-text-muted">
              This provider doesn't require an API key
            </span>
          </div>
        )}
      </div>

      <div className="tw-flex tw-justify-end tw-gap-2 tw-pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSave(provider, apiKeys, baseUrl)}>Save</Button>
      </div>
    </div>
  );
}

export class WebSearchConfigModal extends Modal {
  private root: Root;

  constructor(
    app: App,
    private initialProvider: string,
    private initialApiKeys: Record<string, string>,
    private initialBaseUrl: string
  ) {
    super(app);
    // @ts-ignore
    this.setTitle("Configure Web Search");
  }

  onOpen() {
    const { contentEl } = this;
    this.root = createRoot(contentEl);

    const handleSave = (provider: string, apiKeys: Record<string, string>, baseUrl: string) => {
      updateSetting("webSearchProvider", provider);
      updateSetting("webSearchApiKeys", apiKeys);
      // Also update legacy field for backwards compatibility
      updateSetting("webSearchApiKey", apiKeys[provider] || "");
      updateSetting("webSearchBaseUrl", baseUrl);
      new Notice("Web search provider updated");
      this.close();
    };

    const handleCancel = () => {
      this.close();
    };

    this.root.render(
      <WebSearchConfigModalContent
        initialProvider={this.initialProvider}
        initialApiKeys={this.initialApiKeys}
        initialBaseUrl={this.initialBaseUrl}
        onSave={handleSave}
        onCancel={handleCancel}
        container={this.contentEl}
      />
    );
  }

  onClose() {
    this.root.unmount();
  }
}
