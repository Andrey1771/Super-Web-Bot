using System;
using System.Collections.Generic;
using System.Linq;
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

    public interface IKeycloakClient
    {
        public Task<OrganizationRepresentation> GetOrganizationAsync(string realm, string orgId, string accessToken);
        public Task<List<OrganizationRepresentation>> GetOrganizationsAsync(string realm, string accessToken);
    }
}
