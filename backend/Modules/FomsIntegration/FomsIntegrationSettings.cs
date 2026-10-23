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
    public string OutboundApiKey { get; set; } = "cfeb22557344061f853cee23cef70f2a2508fcbb36658ccc79fec8c7d5049ff4";

    /// <summary>
    /// Inbound API key expected in X-Api-Key when FOMS calls STARS.
    /// </summary>
    public string InboundApiKey { get; set; } = "fdc188d939e6bdb7841d7629ff29dc99a8ef9e2363accafc016929167da8e890";

    public bool CanCallFoms =>
        !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(OutboundApiKey);
}
