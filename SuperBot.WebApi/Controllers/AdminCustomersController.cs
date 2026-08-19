using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>Клиенты: поиск, карточка, блокировка, сброс пароля. Доступно поддержке и админу.</summary>
[ApiController]
[Route("api/admin/customers")]
[Authorize(Policy = "SupportAgent")]
public class AdminCustomersController : ControllerBase
{
    private readonly AdminCustomerService _customers;

    public AdminCustomersController(AdminCustomerService customers) => _customers = customers;

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q = "", CancellationToken ct = default) =>
        Ok(await _customers.SearchAsync(q, ct));

    [HttpGet("{email}")]
    public async Task<IActionResult> Get(string email, CancellationToken ct)
    {
        var card = await _customers.GetAsync(email, ct);
        return card is null ? NotFound(new { message = "No account, orders or support history for this e-mail." }) : Ok(card);
    }

    // Блокировка и сброс пароля — только админ: поддержка смотрит, но не трогает учётку.

    [HttpPost("{email}/block")]
    [Authorize(Roles = "admin")]
    public Task<IActionResult> Block(string email) => Run(() => _customers.SetEnabledAsync(email, enabled: false));

    [HttpPost("{email}/unblock")]
    [Authorize(Roles = "admin")]
    public Task<IActionResult> Unblock(string email) => Run(() => _customers.SetEnabledAsync(email, enabled: true));

    [HttpPost("{email}/reset-password")]
    [Authorize(Roles = "admin")]
    public Task<IActionResult> ResetPassword(string email) => Run(() => _customers.SendPasswordResetAsync(email));

    private async Task<IActionResult> Run(Func<Task<ActionOutcome>> action)
    {
        var outcome = await action();
        var body = new { ok = outcome.Success, message = outcome.Message };
        return outcome.Success ? Ok(body) : StatusCode(outcome.StatusCode, body);
    }
}
