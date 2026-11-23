using Backend.Models.DTOs;

namespace Backend.Modules.DmsIntegration;

public class DmsWebhookProcessorService : BackgroundService
{
    private readonly IDmsWebhookQueue _queue;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DmsWebhookProcessorService> _logger;

    public DmsWebhookProcessorService(
        IDmsWebhookQueue queue,
        IServiceProvider serviceProvider,
        ILogger<DmsWebhookProcessorService> logger)
    {
        _queue = queue;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("DMS Webhook Asynchronous Queue Processor started.");

        try
        {
            await foreach (var item in _queue.ReadAllAsync(stoppingToken))
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var dmsService = scope.ServiceProvider.GetRequiredService<IDmsIntegrationService>();
                    await dmsService.ProcessStatusUpdateAsync(item);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error processing queued DMS webhook status update for waybill {WaybillNo}", item.WaybillNo);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("DMS Webhook Asynchronous Queue Processor stopped gracefully.");
        }
    }
}
