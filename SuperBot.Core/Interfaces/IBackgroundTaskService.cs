using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Interfaces
{
    public interface IBackgroundTaskService
    {
        void ScheduleClearOutdatedDataJob();
    }
}
