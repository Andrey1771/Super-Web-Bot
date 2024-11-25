using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Duende.IdentityServer.Services;
using Duende.IdentityServer.Models;
using Duende.IdentityServer.Test;
using System.Security.Claims;
using SuperBot.Identity.Pages.Account.Login;
using Duende.IdentityServer;
using SuperBot.Core.Interfaces.IRepositories;
namespace SuperBot.Identity.Pages.Account.Login
{
    public class LoginModel : PageModel
    {
        private readonly IUserRepository _userRepository;
        private readonly IIdentityServerInteractionService _interaction;

        public LoginModel(IUserRepository userRepository, IIdentityServerInteractionService interaction)
        {
            _userRepository = userRepository;
            _interaction = interaction;
        }

        [BindProperty]
        public LoginInputModel Input { get; set; }

        public IActionResult OnGet(string returnUrl)
        {
            Input = new LoginInputModel { ReturnUrl = returnUrl };
            return Page();
        }

        public async Task<IActionResult> OnPostAsync()
        {
            if (!ModelState.IsValid)
            {
                return Page();
            }

            // Проверяем логин и пароль через MongoDB
            var isValid = await _userRepository.ValidateCredentialsAsync(Input.Username, Input.Password);
            if (isValid)
            {
                // Получаем пользователя
                var user = await _userRepository.FindByUsernameAsync(Input.Username);

                // Создаем список claims для пользователя
                var additionalClaims = user.Claims.Select(c => new Claim(c.Type, c.Value)).ToList();

                // Создаем объект IdentityServerUser
                var identityServerUser = new IdentityServerUser(user.Id)
                {
                    DisplayName = user.Username,
                    AdditionalClaims = additionalClaims
                };

                // Выполняем вход
                await HttpContext.SignInAsync(identityServerUser);

                // Проверяем валидность ReturnUrl
                if (_interaction.IsValidReturnUrl(Input.ReturnUrl))
                {
                    return Redirect(Input.ReturnUrl);
                }

                return Redirect("~/");
            }

            ModelState.AddModelError("", "Invalid username or password");
            return Page();
        }
    }
}