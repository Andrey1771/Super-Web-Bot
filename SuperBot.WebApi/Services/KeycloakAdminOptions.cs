using System.ComponentModel.DataAnnotations;

namespace SuperBot.WebApi.Services
{
    public sealed class KeycloakAdminOptions
    {
        [Required]
        public string BaseUrl { get; set; } = string.Empty;

        [Required]
        public string Realm { get; set; } = string.Empty;

        [Required]
        public string ClientId { get; set; } = string.Empty;

        [Required]
        public string ClientSecret { get; set; } = string.Empty;

        public string PublicClientId { get; set; } = string.Empty;

        public string SecurityRedirectUri { get; set; } = string.Empty;

        public string AccountConsoleUrl { get; set; } = string.Empty;

        public bool IsConfiguredForSecurity()
        {
            return !string.IsNullOrWhiteSpace(BaseUrl)
                   && !string.IsNullOrWhiteSpace(Realm)
                   && !string.IsNullOrWhiteSpace(ClientId)
                   && !string.IsNullOrWhiteSpace(ClientSecret);
        }

        public string? GetConfigurationError()
        {
            if (IsConfiguredForSecurity())
            {
                return null;
            }

            return "Security integration unavailable. Set Keycloak:Admin:BaseUrl, Realm, ClientId and ClientSecret.";
        }
    }
}
