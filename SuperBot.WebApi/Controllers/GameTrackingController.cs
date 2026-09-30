using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Text.Json.Serialization;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/tracking")]
public class GameTrackingController : ControllerBase
{
    private readonly IGameTrackingRepository _trackingRepository;

    public GameTrackingController(IGameTrackingRepository trackingRepository)
    {
        _trackingRepository = trackingRepository;
    }

    [HttpPost("game-view")]
    public async Task<IActionResult> TrackGameView([FromBody] TrackGameViewRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.GameId))
        {
            return BadRequest("GameId is required.");
        }

        var trackingEvent = new GameTrackingEvent
        {
            GameId = request.GameId,
            UserId = request.UserId,
            AnonId = request.AnonId,
            EventType = "game_view",
            Timestamp = request.Timestamp ?? DateTime.UtcNow
        };

        await _trackingRepository.AddEventAsync(trackingEvent);
        return Ok();
    }

    /// <summary>
    /// Шаг воронки: корзина и начало оплаты.
    ///
    /// Пишется в те же события, что и просмотры игр, — это своя аналитика, а не Google:
    /// её не режут блокировщики и не выключает отказ от куки. Последний шаг воронки —
    /// покупка — здесь не принимается намеренно: она уже есть в заказах, и брать её из
    /// браузера значило бы завести второй, менее надёжный источник тех же денег.
    /// </summary>
    [HttpPost("funnel")]
    public async Task<IActionResult> TrackFunnelStep([FromBody] TrackFunnelStepRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Step))
        {
            return BadRequest("Step is required.");
        }

        var step = request.Step.Trim().ToLowerInvariant();
        if (step != "add_to_cart" && step != "begin_checkout")
        {
            return BadRequest("Unknown funnel step.");
        }

        await _trackingRepository.AddEventAsync(new GameTrackingEvent
        {
            GameId = request.GameId,
            UserId = request.UserId,
            AnonId = request.AnonId,
            EventType = step,
            Timestamp = request.Timestamp ?? DateTime.UtcNow
        });
        return Ok();
    }

    [HttpPost("game-play-media")]
    public async Task<IActionResult> TrackGameMedia([FromBody] TrackGameMediaRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.GameId))
        {
            return BadRequest("GameId is required.");
        }

        var trackingEvent = new GameTrackingEvent
        {
            GameId = request.GameId,
            UserId = request.UserId,
            AnonId = request.AnonId,
            EventType = "media_play",
            MediaId = request.MediaId,
            MediaType = request.MediaType,
            Timestamp = request.Timestamp ?? DateTime.UtcNow
        };

        await _trackingRepository.AddEventAsync(trackingEvent);
        return Ok();
    }

    public class TrackGameViewRequest
    {
        [JsonPropertyName("gameId")]
        public string GameId { get; set; }
        [JsonPropertyName("userId")]
        public string? UserId { get; set; }
        [JsonPropertyName("anonId")]
        public string? AnonId { get; set; }
        [JsonPropertyName("timestamp")]
        public DateTime? Timestamp { get; set; }
    }

    public class TrackFunnelStepRequest
    {
        /// <summary>add_to_cart или begin_checkout. Покупка сюда не приходит — она в заказах.</summary>
        [JsonPropertyName("step")]
        public string Step { get; set; }
        /// <summary>Игра, если шаг относится к конкретному товару. У начала оплаты может быть пусто.</summary>
        [JsonPropertyName("gameId")]
        public string? GameId { get; set; }
        [JsonPropertyName("userId")]
        public string? UserId { get; set; }
        [JsonPropertyName("anonId")]
        public string? AnonId { get; set; }
        [JsonPropertyName("timestamp")]
        public DateTime? Timestamp { get; set; }
    }

    public class TrackGameMediaRequest
    {
        [JsonPropertyName("gameId")]
        public string GameId { get; set; }
        [JsonPropertyName("mediaId")]
        public string? MediaId { get; set; }
        [JsonPropertyName("mediaType")]
        public string? MediaType { get; set; }
        [JsonPropertyName("userId")]
        public string? UserId { get; set; }
        [JsonPropertyName("anonId")]
        public string? AnonId { get; set; }
        [JsonPropertyName("timestamp")]
        public DateTime? Timestamp { get; set; }
    }
}
