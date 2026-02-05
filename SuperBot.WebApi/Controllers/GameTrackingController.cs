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
