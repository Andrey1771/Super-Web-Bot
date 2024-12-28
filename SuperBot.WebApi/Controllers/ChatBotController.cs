using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChatBotController : Controller
    {
        [HttpPost]
        public async Task<IActionResult> SendQuestionMessage([FromBody] QuestionMessage newGame)
        {
            
        }
    }
}
