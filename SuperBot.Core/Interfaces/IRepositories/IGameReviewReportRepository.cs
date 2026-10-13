using System.Collections.Generic;
using System.Threading.Tasks;
using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameReviewReportRepository
    {
        /// <summary>Записывает жалобу. false — этот пользователь уже жаловался на этот отзыв, повтор не считается.</summary>
        Task<bool> AddAsync(GameReviewReport report);

        /// <summary>Сколько разных пользователей пожаловались на отзыв.</summary>
        Task<int> CountReportersAsync(string reviewId);

        /// <summary>Жалобы по набору отзывов — для очереди модератора, свежие первыми.</summary>
        Task<IReadOnlyList<GameReviewReport>> ForReviewsAsync(IEnumerable<string> reviewIds);
    }
}
