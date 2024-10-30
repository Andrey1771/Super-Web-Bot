using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using System.Text.Json;

namespace SuperBot.Core.Services
{
    public class JsonResourceService : IResourceService
    {
        private readonly string _jsonFilePath = "../SuperBot.Core/Properties/resources.json";//TODO

        private Resources? _resources;
        public Resources Resources {
            get {
                if (_resources == null)
                {
                    Task.WaitAll(InitializeAsync(_jsonFilePath));
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

        public async Task UpdateResourcesAsync(Resources newResources)
        {
            _resources = newResources;
            await SaveAsync();
        }

        private async Task SaveAsync()
        {
            if (_resources == null)
                throw new InvalidOperationException("Resources data has not been initialized.");

            try
            {
                using var writer = new StreamWriter(_jsonFilePath, false);
                var jsonString = JsonSerializer.Serialize(_resources, new JsonSerializerOptions
                {
                    WriteIndented = true // Опционально для читабельного формата JSON
                });

                await writer.WriteAsync(jsonString);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error saving resources: {ex.Message}");
            }
        }
    }
}
