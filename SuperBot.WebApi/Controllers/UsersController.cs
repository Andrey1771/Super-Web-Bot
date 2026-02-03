using Microsoft.AspNetCore.Mvc;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/users")]
    public class UsersController : ControllerBase
    {
        [HttpPost("me/viewed/{gameId}")]
        public ActionResult RecordViewedGame(string gameId)
        {
            if (string.IsNullOrWhiteSpace(gameId))
            {
                return BadRequest("Game id is required.");
            }

            return Ok();
        }
    }
}
