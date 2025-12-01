import { useEffect, useState } from 'react';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { useNavigate } from '@remix-run/react';

interface UserStatistics {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  bot_count: number;
  bots: BotInfo[];
  subscription_plan: string;
  subscription_status: string;
  subscription_expiry: string | null;
  token_balance: number;
  is_admin: boolean;
}

interface BotInfo {
  id: string;
  name: string;
  exchange: string;
  status: string;
  open_trades: number;
  created_at: string;
}

interface SystemStats {
  total_users: number;
  active_users_today: number;
  total_bots: number;
  running_bots: number;
  total_open_trades: number;
  total_subscriptions: number;
  active_subscriptions: number;
}

export function AdminStatistics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [systemStats, setSystemStats] = useState<SystemStats>({
    total_users: 0,
    active_users_today: 0,
    total_bots: 0,
    running_bots: 0,
    total_open_trades: 0,
    total_subscriptions: 0,
    active_subscriptions: 0,
  });
  const [users, setUsers] = useState<UserStatistics[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'email' | 'bots' | 'subscription' | 'last_login' | 'status' | 'tokens'>('email');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterBots, setFilterBots] = useState<string>('all');
  const [availablePlans, setAvailablePlans] = useState<string[]>([]);

  // Check if current user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          toast.error('Please sign in to access this page');
          navigate('/');
          return;
        }

        // Check if user is admin from raw_app_meta_data
        const isAdminUser = user.app_metadata?.is_admin === true ||
                           user.email === '10xtraders.ai@gmail.com' ||
                           user.email === 'bmutua350@gmail.com';

        if (!isAdminUser) {
          toast.error('Access denied. Admin privileges required.');
          navigate('/');
          return;
        }

        setIsAdmin(true);
        await fetchStatistics();
      } catch (err) {
        console.error('[AdminStatistics] Error checking admin status:', err);
        toast.error('Error verifying permissions');
        navigate('/');
      }
    };

    checkAdminStatus();
  }, [navigate]);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      // Verify admin status before fetching
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const isAdminUser = user.app_metadata?.is_admin === true ||
                         user.email === '10xtraders.ai@gmail.com' ||
                         user.email === 'bmutua350@gmail.com';

      console.log('[AdminStatistics] Current user:', {
        id: user.id,
        email: user.email,
        is_admin: isAdminUser,
        app_metadata: user.app_metadata
      });

      if (!isAdminUser) {
        throw new Error('User is not an admin');
      }

      // Fetch system-wide statistics (with high limits to get all data)
      console.log('[AdminStatistics] Fetching system-wide statistics...');
      const [
        { count: totalBots },
        { count: totalSubscriptions },
        { data: activeSubsData },
      ] = await Promise.all([
        supabase.from('bot_configurations').select('*', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('id').eq('status', 'active').limit(10000),
      ]);

      console.log('[AdminStatistics] Initial counts:', { totalBots, totalSubscriptions });

      // Calculate active users today by fetching users who signed in today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch ALL users by paginating through RPC results
      // PostgREST has a hard limit, so we need to fetch in batches
      console.log('[AdminStatistics] Fetching all users in batches...');
      let authUsers: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data: batch, error: batchError } = await supabase
          .rpc('get_all_users')
          .range(from, to);

        if (batchError) {
          console.error('[AdminStatistics] Error fetching users batch:', batchError);
          throw new Error(`Failed to fetch users: ${batchError.message}`);
        }

        if (!batch || batch.length === 0) {
          hasMore = false;
        } else {
          authUsers = [...authUsers, ...batch];
          console.log(`[AdminStatistics] Fetched batch ${page + 1}: ${batch.length} users (total: ${authUsers.length})`);

          // If we got less than pageSize, we've reached the end
          if (batch.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        }
      }

      if (authUsers.length === 0) {
        throw new Error('No users found. Please ensure you have admin privileges.');
      }

      console.log(`[AdminStatistics] Fetched ${authUsers.length} total users from database`);

      // Fetch all subscriptions in batches
      console.log('[AdminStatistics] Fetching all subscriptions...');
      let usersData: any[] = [];
      let subPage = 0;
      let hasMoreSubs = true;

      while (hasMoreSubs) {
        const from = subPage * pageSize;
        const to = from + pageSize - 1;

        const { data: batch, error: batchError } = await supabase
          .from('subscriptions')
          .select(`
            user_id,
            status,
            current_period_end,
            subscription_plans (
              name,
              tokens_included
            )
          `)
          .eq('status', 'active')
          .range(from, to);

        if (batchError) throw batchError;

        if (!batch || batch.length === 0) {
          hasMoreSubs = false;
        } else {
          usersData = [...usersData, ...batch];
          if (batch.length < pageSize) hasMoreSubs = false;
          else subPage++;
        }
      }

      console.log(`[AdminStatistics] Fetched ${usersData.length} subscriptions`);

      // Fetch all token balances in batches
      console.log('[AdminStatistics] Fetching all token balances...');
      let tokenBalances: any[] = [];
      let tokenPage = 0;
      let hasMoreTokens = true;

      while (hasMoreTokens) {
        const from = tokenPage * pageSize;
        const to = from + pageSize - 1;

        const { data: batch, error: batchError } = await supabase
          .from('token_balance')
          .select('user_id, total_tokens, used_tokens')
          .range(from, to);

        if (batchError) {
          console.error('[AdminStatistics] Error fetching token balances:', batchError);
          hasMoreTokens = false;
        } else if (!batch || batch.length === 0) {
          hasMoreTokens = false;
        } else {
          tokenBalances = [...tokenBalances, ...batch];
          if (batch.length < pageSize) hasMoreTokens = false;
          else tokenPage++;
        }
      }

      console.log(`[AdminStatistics] Fetched ${tokenBalances.length} token balances`);

      // Fetch all bot configurations in batches
      console.log('[AdminStatistics] Fetching all bot configurations...');

      // First, get the total count directly from the database using COUNT(*)
      const { count: totalBotsCount, error: countError } = await supabase
        .from('bot_configurations')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('[AdminStatistics] Error getting bot count:', countError);
      } else {
        console.log(`[AdminStatistics] Total bots in database (from COUNT): ${totalBotsCount}`);
      }

      let botsData: any[] = [];
      let botPage = 0;
      let hasMoreBots = true;

      while (hasMoreBots) {
        const from = botPage * pageSize;
        const to = from + pageSize - 1;

        console.log(`[AdminStatistics] Fetching bot batch ${botPage + 1} (range: ${from}-${to})...`);

        const { data: batch, error: batchError } = await supabase
          .from('bot_configurations')
          .select('id, name, user_id, config, status, open_trades, created_at')
          .range(from, to);

        if (batchError) {
          console.error(`[AdminStatistics] Error fetching bot batch ${botPage + 1}:`, batchError);
          throw batchError;
        }

        console.log(`[AdminStatistics] Batch ${botPage + 1} returned ${batch?.length || 0} bots`);

        if (!batch || batch.length === 0) {
          hasMoreBots = false;
        } else {
          botsData = [...botsData, ...batch];
          if (batch.length < pageSize) {
            hasMoreBots = false;
          } else {
            botPage++;
          }
        }
      }

      console.log(`[AdminStatistics] Fetched ${botsData.length} bot configurations in ${botPage + 1} batches`);

      // Debug: Log all bot statuses
      const statusCounts = botsData.reduce((acc, bot) => {
        const status = bot.status || 'null';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log('[AdminStatistics] Bot status breakdown:', statusCounts);

      // Combine data
      const userStats: UserStatistics[] = authUsers.map(authUser => {
        const userSub = usersData?.find(s => s.user_id === authUser.id);
        const userBots = botsData?.filter(b => b.user_id === authUser.id) || [];
        const userTokens = tokenBalances?.find(t => t.user_id === authUser.id);

        const bots: BotInfo[] = userBots.map(bot => ({
          id: bot.id,
          name: bot.name,
          exchange: bot.config?.exchange?.name || bot.config?.exchange || 'Unknown',
          status: bot.status || 'Not Deployed',
          open_trades: bot.open_trades || 0,
          created_at: bot.created_at,
        }));

        // Determine if subscription is truly active (not expired)
        const isSubscriptionActive = userSub?.current_period_end
          ? new Date(userSub.current_period_end) > new Date()
          : false;

        const actualStatus = isSubscriptionActive ? 'active' : 'expired';

        // Calculate remaining tokens from token_balance table (source of truth)
        const remainingTokens = userTokens
          ? (userTokens.total_tokens || 0) - (userTokens.used_tokens || 0)
          : 0;

        return {
          id: authUser.id,
          email: authUser.email || 'No email',
          created_at: authUser.created_at,
          last_sign_in_at: authUser.last_sign_in_at,
          bot_count: userBots.length,
          bots,
          subscription_plan: userSub?.subscription_plans?.name || 'Free',
          subscription_status: actualStatus,
          subscription_expiry: userSub?.current_period_end || null,
          token_balance: remainingTokens,
          is_admin: authUser.raw_app_meta_data?.is_admin === true,
        };
      });

      setUsers(userStats);

      // Extract unique plan names for the filter dropdown
      const uniquePlans = [...new Set(userStats.map(u => u.subscription_plan))].sort();
      setAvailablePlans(uniquePlans);
      console.log(`[AdminStatistics] Available plans: ${uniquePlans.join(', ')}`);

      // Calculate active users today from authUsers
      const activeToday = authUsers.filter(user => {
        if (!user.last_sign_in_at) return false;
        const lastSignIn = new Date(user.last_sign_in_at);
        return lastSignIn >= today;
      }).length;

      // Calculate truly active subscriptions (not expired)
      const activeSubscriptions = usersData?.filter(sub =>
        sub.current_period_end && new Date(sub.current_period_end) > new Date()
      ).length || 0;

      // Calculate deployed bots using the exact same criteria as the SQL query:
      // SELECT COUNT(*) FROM bot_configurations
      // WHERE status IS NOT NULL AND status != 'NotFound' AND status != 'Not Deployed'
      const deployedBots = botsData?.filter(bot =>
        bot.status !== null &&
        bot.status !== 'NotFound' &&
        bot.status !== 'Not Deployed'
      ) || [];

      const deployedBotsCount = deployedBots.length;

      // Calculate total open trades from ALL fetched bots (not just deployed ones)
      const total_open_trades = botsData.reduce((sum, bot) => sum + (bot.open_trades || 0), 0);

      console.log('[AdminStatistics] ====== FINAL CALCULATIONS ======');
      console.log('[AdminStatistics] Total bots from count query:', totalBots);
      console.log('[AdminStatistics] Total bots fetched in batches:', botsData.length);
      console.log('[AdminStatistics] Deployed bots count (matching SQL criteria):', deployedBotsCount);
      console.log('[AdminStatistics] Total open trades across all bots:', total_open_trades);
      console.log('[AdminStatistics] Deployed bot IDs:', deployedBots.map(b => ({ id: b.id, name: b.name, status: b.status, open_trades: b.open_trades })));
      console.log('[AdminStatistics] All bot statuses:', botsData.map(b => ({ id: b.id, name: b.name, status: b.status, open_trades: b.open_trades })));
      console.log('[AdminStatistics] ================================');

      // Set all system stats including total users from authUsers
      // IMPORTANT: Use botsData.length (actual fetched bots) instead of totalBots from count query
      setSystemStats({
        total_users: authUsers.length,
        active_users_today: activeToday,
        total_bots: botsData.length, // Use actual fetched count instead of head count
        running_bots: deployedBotsCount, // Use deployed bots count matching SQL criteria
        total_open_trades,
        total_subscriptions: totalSubscriptions || 0,
        active_subscriptions: activeSubscriptions,
      });
    } catch (err: any) {
      console.error('[AdminStatistics] Error fetching statistics:', err);
      toast.error('Failed to load statistics: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredAndSortedUsers = users
    .filter(user => {
      // Text search filter
      const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.subscription_plan.toLowerCase().includes(searchTerm.toLowerCase());

      // Plan filter
      const matchesPlan = filterPlan === 'all' || user.subscription_plan.toLowerCase() === filterPlan.toLowerCase();

      // Status filter
      const matchesStatus = filterStatus === 'all' || user.subscription_status.toLowerCase() === filterStatus.toLowerCase();

      // Bots filter
      let matchesBots = true;
      if (filterBots === 'none') {
        matchesBots = user.bot_count === 0;
      } else if (filterBots === 'has_bots') {
        matchesBots = user.bot_count > 0;
      } else if (filterBots === 'deployed_bots') {
        // Check if user has any deployed bots (status !== null, 'NotFound', or 'Not Deployed')
        matchesBots = user.bots.some(bot =>
          bot.status !== null &&
          bot.status !== 'NotFound' &&
          bot.status !== 'Not Deployed'
        );
      } else if (filterBots === '1-5') {
        matchesBots = user.bot_count >= 1 && user.bot_count <= 5;
      } else if (filterBots === '6+') {
        matchesBots = user.bot_count >= 6;
      }

      return matchesSearch && matchesPlan && matchesStatus && matchesBots;
    })
    .sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'email':
          comparison = a.email.localeCompare(b.email);
          break;
        case 'bots':
          comparison = a.bot_count - b.bot_count;
          break;
        case 'subscription':
          comparison = a.subscription_plan.localeCompare(b.subscription_plan);
          break;
        case 'status':
          comparison = a.subscription_status.localeCompare(b.subscription_status);
          break;
        case 'tokens':
          comparison = a.token_balance - b.token_balance;
          break;
        case 'last_login':
          const aDate = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
          const bDate = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
          comparison = aDate - bDate;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // Calculate pagination
  const totalPages = Math.ceil(filteredAndSortedUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const paginatedUsers = filteredAndSortedUsers.slice(startIndex, endIndex);

  // Reset to page 1 when search term changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Reset to page 1 when filters change
  const handleFilterChange = (filterType: 'plan' | 'status' | 'bots', value: string) => {
    if (filterType === 'plan') setFilterPlan(value);
    if (filterType === 'status') setFilterStatus(value);
    if (filterType === 'bots') setFilterBots(value);
    setCurrentPage(1);
  };

  // Get unique statuses from users (plans are set in fetchStatistics)
  const uniqueStatuses = Array.from(new Set(users.map(u => u.subscription_status))).sort();

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!isAdmin) {
    return <div className="p-8">Checking permissions...</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="i-svg-spinners:90-ring-with-bg text-4xl text-accent-500 mb-4" />
          <p className="text-bolt-elements-textSecondary">Loading statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-bolt-elements-textPrimary mb-2">
          Admin Statistics Dashboard
        </h1>
        <p className="text-bolt-elements-textSecondary">
          System-wide overview and user management
        </p>
      </div>

      {/* System Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Users"
          value={systemStats.total_users}
          icon="i-ph:users"
          color="text-blue-500"
        />
        <StatCard
          title="Active Today"
          value={systemStats.active_users_today}
          icon="i-ph:user-check"
          color="text-green-500"
        />
        <StatCard
          title="Total Bots"
          value={systemStats.total_bots}
          subtitle={`${systemStats.running_bots} deployed`}
          icon="i-ph:robot"
          color="text-purple-500"
        />
        <StatCard
          title="Open Trades"
          value={systemStats.total_open_trades}
          icon="i-ph:chart-line-up"
          color="text-orange-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Total Subscriptions"
          value={systemStats.total_subscriptions}
          subtitle={`${systemStats.active_subscriptions} active`}
          icon="i-ph:credit-card"
          color="text-teal-500"
        />
        <StatCard
          title="Active Subscriptions"
          value={systemStats.active_subscriptions}
          icon="i-ph:check-circle"
          color="text-green-500"
        />
        <StatCard
          title="Inactive Subscriptions"
          value={systemStats.total_subscriptions - systemStats.active_subscriptions}
          icon="i-ph:x-circle"
          color="text-red-500"
        />
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        {/* Search and Refresh Row */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by email or subscription plan..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <button
            onClick={fetchStatistics}
            className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <div className="i-ph:arrow-clockwise text-lg" />
            Refresh
          </button>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-bolt-elements-textSecondary">Plan:</label>
            <select
              value={filterPlan}
              onChange={(e) => handleFilterChange('plan', e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="all">All Plans</option>
              {availablePlans.map(plan => (
                <option key={plan} value={plan}>{plan}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-bolt-elements-textSecondary">Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="all">All Statuses</option>
              {uniqueStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-bolt-elements-textSecondary">Bots:</label>
            <select
              value={filterBots}
              onChange={(e) => handleFilterChange('bots', e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="all">All Users</option>
              <option value="none">No Bots</option>
              <option value="has_bots">Has Bots</option>
              <option value="deployed_bots">Has Deployed Bots</option>
              <option value="1-5">1-5 Bots</option>
              <option value="6+">6+ Bots</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {(filterPlan !== 'all' || filterStatus !== 'all' || filterBots !== 'all' || searchTerm) && (
            <button
              onClick={() => {
                setFilterPlan('all');
                setFilterStatus('all');
                setFilterBots('all');
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors flex items-center gap-1"
            >
              <div className="i-ph:x text-base" />
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-bolt-elements-background-depth-3 border-b-2 border-bolt-elements-borderColor">
              <tr>
                <th
                  onClick={() => toggleSort('email')}
                  className="px-4 py-3 text-left text-xs font-semibold text-bolt-elements-textPrimary uppercase tracking-wider cursor-pointer hover:bg-bolt-elements-background-depth-4"
                >
                  <div className="flex items-center gap-2">
                    Email
                    {sortBy === 'email' && (
                      <div className={sortOrder === 'asc' ? 'i-ph:arrow-up' : 'i-ph:arrow-down'} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('bots')}
                  className="px-4 py-3 text-left text-xs font-semibold text-bolt-elements-textPrimary uppercase tracking-wider cursor-pointer hover:bg-bolt-elements-background-depth-4"
                >
                  <div className="flex items-center gap-2">
                    Bots
                    {sortBy === 'bots' && (
                      <div className={sortOrder === 'asc' ? 'i-ph:arrow-up' : 'i-ph:arrow-down'} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('subscription')}
                  className="px-4 py-3 text-left text-xs font-semibold text-bolt-elements-textPrimary uppercase tracking-wider cursor-pointer hover:bg-bolt-elements-background-depth-4"
                >
                  <div className="flex items-center gap-2">
                    Plan
                    {sortBy === 'subscription' && (
                      <div className={sortOrder === 'asc' ? 'i-ph:arrow-up' : 'i-ph:arrow-down'} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('status')}
                  className="px-4 py-3 text-left text-xs font-semibold text-bolt-elements-textPrimary uppercase tracking-wider cursor-pointer hover:bg-bolt-elements-background-depth-4"
                >
                  <div className="flex items-center gap-2">
                    Status
                    {sortBy === 'status' && (
                      <div className={sortOrder === 'asc' ? 'i-ph:arrow-up' : 'i-ph:arrow-down'} />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-bolt-elements-textPrimary uppercase tracking-wider">
                  Expiry
                </th>
                <th
                  onClick={() => toggleSort('tokens')}
                  className="px-4 py-3 text-left text-xs font-semibold text-bolt-elements-textPrimary uppercase tracking-wider cursor-pointer hover:bg-bolt-elements-background-depth-4"
                >
                  <div className="flex items-center gap-2">
                    Tokens
                    {sortBy === 'tokens' && (
                      <div className={sortOrder === 'asc' ? 'i-ph:arrow-up' : 'i-ph:arrow-down'} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('last_login')}
                  className="px-4 py-3 text-left text-xs font-semibold text-bolt-elements-textPrimary uppercase tracking-wider cursor-pointer hover:bg-bolt-elements-background-depth-4"
                >
                  <div className="flex items-center gap-2">
                    Last Login
                    {sortBy === 'last_login' && (
                      <div className={sortOrder === 'asc' ? 'i-ph:arrow-up' : 'i-ph:arrow-down'} />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-bolt-elements-textPrimary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bolt-elements-borderColor">
              {paginatedUsers.map((user) => (
                <UserRow key={user.id} user={user} formatDate={formatDate} formatDateShort={formatDateShort} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-bolt-elements-textSecondary">
          Showing {startIndex + 1} to {Math.min(endIndex, filteredAndSortedUsers.length)} of {filteredAndSortedUsers.length} users
          {searchTerm && ` (filtered from ${users.length} total)`}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bolt-elements-background-depth-3 transition-colors"
          >
            <div className="i-ph:caret-double-left" />
          </button>

          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bolt-elements-background-depth-3 transition-colors"
          >
            <div className="i-ph:caret-left" />
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(page => {
                // Show first page, last page, current page, and pages around current
                return page === 1 ||
                       page === totalPages ||
                       Math.abs(page - currentPage) <= 1;
              })
              .map((page, index, array) => {
                // Add ellipsis between non-consecutive pages
                const showEllipsis = index > 0 && page - array[index - 1] > 1;
                return (
                  <>
                    {showEllipsis && (
                      <span key={`ellipsis-${page}`} className="px-2 text-bolt-elements-textSecondary">
                        ...
                      </span>
                    )}
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={classNames(
                        'px-3 py-1 rounded-lg border transition-colors',
                        currentPage === page
                          ? 'border-accent-500 bg-accent-500 text-white'
                          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3'
                      )}
                    >
                      {page}
                    </button>
                  </>
                );
              })}
          </div>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bolt-elements-background-depth-3 transition-colors"
          >
            <div className="i-ph:caret-right" />
          </button>

          <button
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bolt-elements-background-depth-3 transition-colors"
          >
            <div className="i-ph:caret-double-right" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: string;
  color: string;
}

function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
  return (
    <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-6 hover:border-accent-500 transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-bolt-elements-textSecondary text-sm mb-1">{title}</p>
          <p className="text-3xl font-bold text-bolt-elements-textPrimary">{value.toLocaleString()}</p>
          {subtitle && <p className="text-xs text-bolt-elements-textTertiary mt-1">{subtitle}</p>}
        </div>
        <div className={classNames(icon, 'text-4xl', color)} />
      </div>
    </div>
  );
}

interface UserRowProps {
  user: UserStatistics;
  formatDate: (date: string | null) => string;
  formatDateShort: (date: string | null) => string;
}

function UserRow({ user, formatDate, formatDateShort }: UserRowProps) {
  const [expanded, setExpanded] = useState(false);

  const getPlanBadgeColor = (plan: string) => {
    switch (plan.toLowerCase()) {
      case 'elite':
      case 'premium':
        return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
      case 'pro':
        return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
      case 'free':
        return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    return status === 'active'
      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
      : 'bg-red-500/20 text-red-400 border border-red-500/30';
  };

  const getBotStatusColor = (status: string) => {
    if (status.includes('Running')) return 'text-green-500';
    if (status.includes('Check Logs')) return 'text-amber-500';
    if (status.includes('Deploying')) return 'text-yellow-500';
    return 'text-gray-500';
  };

  return (
    <>
      <tr className="hover:bg-bolt-elements-background-depth-3 transition-colors">
        <td className="px-4 py-3 text-sm text-bolt-elements-textPrimary">
          <div className="flex items-center gap-2">
            {user.is_admin && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-500">
                Admin
              </span>
            )}
            {user.email}
          </div>
        </td>
        <td className="px-4 py-3 text-sm">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 hover:text-accent-500 transition-colors"
          >
            <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-md text-sm font-semibold bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary border border-bolt-elements-borderColor">
              {user.bot_count}
            </span>
            {user.bot_count > 0 && (
              <div className={classNames(
                'text-bolt-elements-textSecondary',
                expanded ? 'i-ph:caret-up' : 'i-ph:caret-down'
              )} />
            )}
          </button>
        </td>
        <td className="px-4 py-3 text-sm">
          <span className={classNames(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
            getPlanBadgeColor(user.subscription_plan)
          )}>
            {user.subscription_plan}
          </span>
        </td>
        <td className="px-4 py-3 text-sm">
          <span className={classNames(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
            getStatusBadgeColor(user.subscription_status)
          )}>
            {user.subscription_status}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-bolt-elements-textSecondary">
          {formatDateShort(user.subscription_expiry)}
        </td>
        <td className="px-4 py-3 text-sm text-bolt-elements-textPrimary font-medium">
          {user.token_balance.toLocaleString()}
        </td>
        <td className="px-4 py-3 text-sm text-bolt-elements-textSecondary">
          {formatDate(user.last_sign_in_at)}
        </td>
        <td className="px-4 py-3 text-sm">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-accent-500 hover:text-accent-600 text-xs font-medium transition-colors"
          >
            {expanded ? 'Hide Details' : 'View Details'}
          </button>
        </td>
      </tr>

      {/* Expanded Bot Details Row */}
      {expanded && user.bots.length > 0 && (
        <tr>
          <td colSpan={8} className="px-4 py-3 bg-bolt-elements-background-depth-4">
            <div className="pl-8">
              <h4 className="text-xs font-semibold text-bolt-elements-textPrimary mb-2 uppercase">
                User's Bots ({user.bots.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {user.bots.map(bot => (
                  <div
                    key={bot.id}
                    className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-bolt-elements-textPrimary truncate">
                          {bot.name}
                        </p>
                        <p className="text-xs text-bolt-elements-textTertiary">
                          {bot.exchange}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={classNames('font-medium', getBotStatusColor(bot.status))}>
                        {bot.status}
                      </span>
                      <span className="text-bolt-elements-textSecondary">
                        {bot.open_trades} open trade{bot.open_trades !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
