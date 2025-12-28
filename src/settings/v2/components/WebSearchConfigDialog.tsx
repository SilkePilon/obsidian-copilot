import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTab } from "@/contexts/TabContext";
import { updateSetting, useSettingsValue } from "@/settings/model";
import {
  WEB_SEARCH_PROVIDERS,
  DEFAULT_WEB_SEARCH_PROVIDER,
} from "@/tools/providers/WebSearchProvider";
import { ExternalLink } from "lucide-react";
import { Notice } from "obsidian";
import React, { useState, useEffect } from "react";

interface WebSearchConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WebSearchConfigDialog: React.FC<WebSearchConfigDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { modalContainer } = useTab();
  const settings = useSettingsValue();
  const [dialogElement, setDialogElement] = useState<HTMLDivElement | null>(null);

  // Local state for editing
  const [provider, setProvider] = useState(settings.webSearchProvider || DEFAULT_WEB_SEARCH_PROVIDER);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(settings.webSearchApiKeys || {});
  const [baseUrl, setBaseUrl] = useState(settings.webSearchBaseUrl || "");

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      setProvider(settings.webSearchProvider || DEFAULT_WEB_SEARCH_PROVIDER);
      // Merge legacy single key into per-provider keys if present
      const keys = { ...(settings.webSearchApiKeys || {}) };
      if (settings.webSearchApiKey && !keys[settings.webSearchProvider || DEFAULT_WEB_SEARCH_PROVIDER]) {
        keys[settings.webSearchProvider || DEFAULT_WEB_SEARCH_PROVIDER] = settings.webSearchApiKey;
      }
      setApiKeys(keys);
      setBaseUrl(settings.webSearchBaseUrl || "");
    }
  }, [open, settings.webSearchProvider, settings.webSearchApiKey, settings.webSearchApiKeys, settings.webSearchBaseUrl]);

  const selectedProvider = WEB_SEARCH_PROVIDERS[provider];
  const currentApiKey = apiKeys[provider] || "";

  const handleApiKeyChange = (value: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: value }));
  };

  const handleSave = () => {
    updateSetting("webSearchProvider", provider);
    updateSetting("webSearchApiKeys", apiKeys);
    // Also update legacy field for backwards compatibility
    updateSetting("webSearchApiKey", apiKeys[provider] || "");
    updateSetting("webSearchBaseUrl", baseUrl);
    new Notice("Web search provider updated");
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:tw-max-w-[425px]"
        container={modalContainer}
        ref={(el) => setDialogElement(el)}
      >
        <DialogHeader>
          <DialogTitle>Configure Web Search</DialogTitle>
          <DialogDescription>
            Configure how Copilot searches the web for information.
          </DialogDescription>
        </DialogHeader>

        <div className="tw-space-y-4">
          <FormField
            label="Web Search Provider"
            description={selectedProvider?.description || "Select a provider for web search"}
          >
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent container={dialogElement}>
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
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
