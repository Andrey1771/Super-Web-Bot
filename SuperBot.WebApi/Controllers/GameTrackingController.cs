using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

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
        public string GameId { get; set; }
        public string UserId { get; set; }
        public string AnonId { get; set; }
        public DateTime? Timestamp { get; set; }
    }

    public class TrackGameMediaRequest
    {
        public string GameId { get; set; }
        public string MediaId { get; set; }
        public string MediaType { get; set; }
        public string UserId { get; set; }
        public string AnonId { get; set; }
        public DateTime? Timestamp { get; set; }
    }
}
