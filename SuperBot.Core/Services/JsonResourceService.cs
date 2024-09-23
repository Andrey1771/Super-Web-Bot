using System.Text.Json;

namespace SuperBot.Core.Services
{
    public class JsonResourceService
    {
        private Dictionary<string, MultipleValues> _resources;

        public JsonResourceService()
        {
            _resources = new Dictionary<string, MultipleValues>();
        }

        public async Task InitializeAsync(string jsonFilePath)
        {
            var jsonString = await File.ReadAllTextAsync(jsonFilePath);
            _resources = await JsonSerializer.DeserializeAsync<Dictionary<string, MultipleValues>>(jsonString);
        }

        public async Task<List<string>> GetMultipleValues(string key)//TODO
        {
            await InitializeAsync("resources.json");

            if (_resources.ContainsKey(key))
            {
                return _resources[key].Values;
            }
            else
            {
                throw new ArgumentException($"The key '{key}' not found in the resources.");
            }
        }
    }

    public class MultipleValues
    {
        public List<string> Values { get; set; }
    }
}
