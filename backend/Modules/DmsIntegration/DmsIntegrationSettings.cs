namespace Backend.Modules.DmsIntegration;

public class DmsIntegrationSettings
{
    public const string SectionName = "DmsIntegration";

    /// <summary>
    /// Base URL of the DMS API, e.g. https://dts-api-gab-byafd0h2aha6a9c9.japaneast-01.azurewebsites.net
    /// </summary>
    public string BaseUrl { get; set; } = string.Empty;

    /// <summary>
    /// Outbound API key presented in X-Api-Key when STARS calls DMS.
    /// </summary>
    public string OutboundApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Inbound API key expected in X-Api-Key when DMS calls STARS.
    /// </summary>
    public string InboundApiKey { get; set; } = string.Empty;

    public bool CanCallDms =>
        !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(OutboundApiKey);
}
