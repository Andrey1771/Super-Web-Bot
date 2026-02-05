using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api")]
public class GameQuestionsController : ControllerBase
{
    private readonly IGameQuestionRepository _questionRepository;

    public GameQuestionsController(IGameQuestionRepository questionRepository)
    {
        _questionRepository = questionRepository;
    }

    [HttpGet("games/{gameId}/questions")]
    public async Task<IActionResult> GetQuestions(string gameId, [FromQuery] int limit = 20)
    {
        var items = await _questionRepository.GetByGameIdAsync(gameId, Math.Clamp(limit, 1, 50));
        return Ok(new { items });
    }

    [Authorize]
    [HttpPost("games/{gameId}/questions")]
    public async Task<IActionResult> AskQuestion(string gameId, [FromBody] QuestionRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Question))
        {
            return BadRequest("Question is required.");
        }

        var question = new GameQuestion
        {
            GameId = gameId,
            UserId = GetUserId(),
            UserName = GetUserName(),
            Question = request.Question,
            CreatedAt = DateTime.UtcNow
        };

        await _questionRepository.AddQuestionAsync(question);
        return Ok(question);
    }

    [Authorize]
    [HttpPost("questions/{questionId}/answers")]
    public async Task<IActionResult> AnswerQuestion(string questionId, [FromBody] AnswerRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest("Answer text is required.");
        }

        var answer = new GameAnswer
        {
            Id = Guid.NewGuid().ToString(),
            UserId = GetUserId(),
            UserName = GetUserName(),
            Text = request.Text,
            CreatedAt = DateTime.UtcNow
        };

        await _questionRepository.AddAnswerAsync(questionId, answer);
        return Ok(answer);
    }

    private string GetUserId()
    {
        return User.FindFirst("sub")?.Value ?? User.FindFirst("userId")?.Value ?? string.Empty;
    }

    private string GetUserName()
    {
        return User.Identity?.Name ?? User.FindFirst("preferred_username")?.Value ?? User.FindFirst("email")?.Value ?? string.Empty;
    }

    public class QuestionRequest
    {
        public string Question { get; set; }
    }

    public class AnswerRequest
    {
        public string Text { get; set; }
    }
}
