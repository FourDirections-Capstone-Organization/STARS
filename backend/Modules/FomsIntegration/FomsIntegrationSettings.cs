namespace Backend.Modules.FomsIntegration;

public class FomsIntegrationSettings
{
    public const string SectionName = "FomsIntegration";

    /// <summary>
    /// Base URL of the FOMS API in Azure (e.g. https://fomsintegration-amfve2fdccbdgbgy.eastasia-01.azurewebsites.net)
    /// </summary>
    public string BaseUrl { get; set; } = "https://fomsintegration-amfve2fdccbdgbgy.eastasia-01.azurewebsites.net";

    /// <summary>
    /// Outbound API key presented in X-Api-Key when STARS calls FOMS.
    /// </summary>
    public string OutboundApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Inbound API key expected in X-Api-Key when FOMS calls STARS.
    /// </summary>
    public string InboundApiKey { get; set; } = string.Empty;

    public bool CanCallFoms =>
        !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(OutboundApiKey);
}
