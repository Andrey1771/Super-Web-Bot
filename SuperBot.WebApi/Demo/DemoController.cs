using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Демо-сайт: включено ли демо и какие демо-аккаунты показать посетителю. На обычном магазине (Demo:Enabled = false)
/// отвечает «демо выключено», и витрина ничего демо-шного не рисует.
/// </summary>
[ApiController]
[Route("api/demo")]
public sealed class DemoController(IOptions<DemoOptions> options) : ControllerBase
{
    private DemoOptions Demo => options.Value;

    [HttpGet("config")]
    public IActionResult GetConfig()
    {
        if (!Demo.Enabled)
        {
            return Ok(new { enabled = false });
        }
        return Ok(new
        {
            enabled = true,
            accounts = Demo.Accounts.Select(a => new { role = a.Role, username = a.Username, password = a.Password }),
        });
    }
}
