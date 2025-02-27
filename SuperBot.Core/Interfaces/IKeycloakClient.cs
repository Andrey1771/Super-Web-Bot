using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace SuperBot.Core.Interfaces
{
    public class OrganizationRepresentation
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
    }

    public class UserCredentialRepresentation
    {
        public string Id { get; set; }
        public string Type { get; set; }
        public bool Temporary { get; set; }
    }

    public class LoginEventRepresentation
    {
        public string Id { get; set; }
        public long Time { get; set; }
        public string Type { get; set; }
        public string RealmId { get; set; }
        public string ClientId { get; set; }
        public string UserId { get; set; }
        public string IpAddress { get; set; }
        public Dictionary<string, string> Details { get; set; }
    }

    public class UserSessionRepresentation
    {
        public string Id { get; set; }
        public long Start { get; set; }
        public long LastAccess { get; set; }
        public string ClientId { get; set; }
        public string IpAddress { get; set; }
        public string Browser { get; set; }
        public string Os { get; set; }
    }


    public interface IKeycloakClient
    {
        public Task<OrganizationRepresentation> GetOrganizationAsync(string realm, string orgId, string accessToken);
        public Task<List<OrganizationRepresentation>> GetOrganizationsAsync(string realm, string accessToken);
        Task<List<dynamic>> GetUserCredentialsAsync(string realm, string userId, string accessToken);
        Task<List<LoginEventRepresentation>> GetAllLoginEventsAsync(string realm, string accessToken);
        public Task<List<LoginEventRepresentation>> GetUserLoginEventsAsync(string realm, string userId, string accessToken);
        public Task<List<UserSessionRepresentation>> GetUserSessionsAsync(string realm, string userId, string accessToken);

    }
}
