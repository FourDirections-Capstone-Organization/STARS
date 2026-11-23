using System.Threading.Channels;
using Backend.Models.DTOs;

namespace Backend.Modules.DmsIntegration;

public interface IDmsWebhookQueue
{
    ValueTask EnqueueAsync(DmsStatusWebhookDTO item, CancellationToken cancellationToken = default);
    IAsyncEnumerable<DmsStatusWebhookDTO> ReadAllAsync(CancellationToken cancellationToken = default);
}

public class DmsWebhookQueue : IDmsWebhookQueue
{
    private readonly Channel<DmsStatusWebhookDTO> _channel;

    public DmsWebhookQueue(int capacity = 10000)
    {
        var options = new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        };
        _channel = Channel.CreateBounded<DmsStatusWebhookDTO>(options);
    }

    public ValueTask EnqueueAsync(DmsStatusWebhookDTO item, CancellationToken cancellationToken = default)
    {
        return _channel.Writer.WriteAsync(item, cancellationToken);
    }

    public IAsyncEnumerable<DmsStatusWebhookDTO> ReadAllAsync(CancellationToken cancellationToken = default)
    {
        return _channel.Reader.ReadAllAsync(cancellationToken);
    }
}
