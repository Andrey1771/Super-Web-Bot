using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Events;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChatBotController : Controller
    {
        [HttpPost]
        public async Task<IActionResult> SendQuestionMessage([FromBody] QuestionMessage message, [FromServices] IBotEventPublisher botEvents)
        {
            // Вопрос из формы поддержки уходит админу в Telegram — через outbox, доставит бот-сервис.
            var text = $"📩 Новый вопрос с сайта\nТелефон: {message.Phone}\nИмя: {message.Name}\nemail: {message.Email}\nВопрос: {message.Question}";
            await botEvents.PublishAsync(BotEventTypes.SupportEscalation, new SupportEscalationEvent(text));
            return Ok();
        }
    }
}
