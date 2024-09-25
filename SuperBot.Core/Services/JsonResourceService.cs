using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using System.Text.Json;

namespace SuperBot.Core.Services
{
    public class JsonResourceService : IResourceService
    {
        private Resources? _resources;
        public Resources Resources {
            get {
                if (_resources == null)
                {
                    Task.WaitAll(InitializeAsync("../SuperBot.Core/Properties/resources.json"));//TODO
                }
                return _resources;
            }
        }

        private async Task InitializeAsync(string jsonFilePath)
        {
            try
            {
                using var reader = new StreamReader(jsonFilePath);

                if (reader == null)
                {
                    throw new Exception($"The file '{jsonFilePath}' not found");
                }

                var jsonString = reader.BaseStream;

                _resources = await JsonSerializer.DeserializeAsync<Resources>(jsonString);
            }
            catch (Exception ex) {
                Console.WriteLine(ex);
            }
        }
    }
}
