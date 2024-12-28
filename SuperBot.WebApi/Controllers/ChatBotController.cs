using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Application.Commands.Telegram;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChatBotController : Controller
    {
        [HttpPost]
        public async Task<IActionResult> SendQuestionMessage([FromBody] QuestionMessage newGame, IMediator _mediator)
        {
            var confirmTopUpSteamCommand = new NotifyAdminCommand()
            {
                Question = newGame.Question,
                Email = newGame.Email,
                Name = newGame.Name,
                Phone = newGame.Phone
            };

            await _mediator.Send(confirmTopUpSteamCommand);

            return Ok();
        }
    }
}
