using SuperBot.Core.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface ISettingsRepository
    {
        Task<IEnumerable<Settings>> GetAllAsync();
        Task UpdateAsync(Settings updatedSettings);
        Task CreateAsync(Settings settings);
    }
}
