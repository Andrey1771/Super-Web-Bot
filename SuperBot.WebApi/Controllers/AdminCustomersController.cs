using System.Linq;
using SuperBot.Common.Auth;
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

    /// <summary>
    /// Список покупателей окнами: таблица подгружает следующее окно по мере прокрутки.
    /// Продолжение задаётся почтой последней показанной строки, а не номером страницы.
    /// </summary>
    [HttpGet("browse")]
    public async Task<IActionResult> Browse(
        [FromQuery] string? after = null,
        [FromQuery] int limit = 50,
        [FromQuery] string? filter = null,
        CancellationToken ct = default) =>
        Ok(await _customers.BrowseAsync(filter, after, limit, ct));

    /// <summary>Текущий срез таблицы файлом. BOM — чтобы Excel открыл кириллицу без танцев.</summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? filter = null,
        [FromQuery] string? q = null,
        CancellationToken ct = default)
    {
        var csv = await _customers.ExportCsvAsync(filter, q, ct);
        var bytes = System.Text.Encoding.UTF8.GetPreamble()
            .Concat(System.Text.Encoding.UTF8.GetBytes(csv))
            .ToArray();
        return File(bytes, "text/csv", "customers.csv");
    }

    [HttpGet("{email}")]
    public async Task<IActionResult> Get(string email, CancellationToken ct)
    {
        var card = await _customers.GetAsync(email, ct);
        return card is null ? NotFound(new { message = "No account, orders or support history for this e-mail." }) : Ok(card);
    }

    // Блокировка и сброс пароля — только админ: поддержка смотрит, но не трогает учётку.

    [HttpPost("{email}/block")]
    [Authorize(Roles = "admin")]
    // Почта нажавшего идёт в сервис: спрятанной кнопки мало, запрос можно послать и мимо
    // интерфейса, а заблокировать себя — самая дорогая из возможных здесь ошибок.
    public Task<IActionResult> Block(string email) =>
        Run(() => _customers.SetEnabledAsync(email, enabled: false, actorEmail: User.GetUserKey()));

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
