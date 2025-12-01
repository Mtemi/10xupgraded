// app/components/sidebar/UserProfile.tsx
import { useStore } from '@nanostores/react';
import { useState, useEffect } from 'react';
import { IoIosInformationCircleOutline } from "react-icons/io";
import { MdOutlinePrivacyTip } from "react-icons/md";
import { FiFileText } from "react-icons/fi";
import { BsFileEarmarkMedical } from "react-icons/bs";
import { LuLogOut } from "react-icons/lu";
import { Link } from '@remix-run/react';
import { FaXTwitter } from "react-icons/fa6";
import { authStore } from '~/lib/stores/auth';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';

export function UserProfile() {
  const { isAuthenticated } = useStore(authStore);
  const [userData, setUserData] = useState<any>();

  useEffect(() => {
    let allData = localStorage;
    let tokenName: any = Object.keys(allData).filter((item) => item.includes('auth-token'));
    if (tokenName && tokenName.length > 0) {
      let userDetails: any = localStorage.getItem(tokenName[0]);
      setUserData(JSON.parse(userDetails));
    }
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success('Successfully signed out');
    } catch (error) {
      console.error('Sign out failed:', error);
      toast.error('Failed to sign out');
    }
  };

  return (
    <div className="flex flex-col gap-5 items-center justify-between">
      <div className="flex flex-col dark:bg-black bg-white w-full h-full py-2">
        <Link
          to={'/page/about'}
          className="flex items-center gap-2 bg-white/0 hover:bg-gray-100 dark:hover:bg-gray-100/10 duration-300 w-full p-3 text-black dark:text-white"
        >
          <span className="text-lg">
            <IoIosInformationCircleOutline />
          </span>
          About us
        </Link>
        <Link
          to={'/page/privacy-policy'}
          className="flex items-center gap-2  bg-white/0 hover:bg-gray-100 dark:hover:bg-gray-100/10 duration-300 w-full p-3 text-black dark:text-white"
        >
          <span className="text-lg">
            <MdOutlinePrivacyTip />
          </span>
          Privacy Policy
        </Link>
        <Link
          to={'/page/terms-of-service'}
          className="flex items-center gap-2  bg-white/0 hover:bg-gray-100 dark:hover:bg-gray-100/10 duration-300 w-full p-3 text-black dark:text-white"
        >
          <span className="text-[16px]">
            <FiFileText />
          </span>
          Terms & Conditions
        </Link>
        <Link
          to={'/page/disclaimer'}
          className="flex items-center gap-2  bg-white/0 hover:bg-gray-100 dark:hover:bg-gray-100/10 duration-300 w-full p-3 text-black dark:text-white"
        >
          <span className="text-[16px]">
            <BsFileEarmarkMedical />
          </span>
          Disclaimer
        </Link>
        <Link
          to={'https://x.com/10xtradersai'}
          className="flex items-center gap-2  bg-white/0 hover:bg-gray-100 dark:hover:bg-gray-100/10 duration-300 w-full p-3 text-black dark:text-white"
        >
          <span className="text-lg">
            <FaXTwitter/>
          </span>
          Follow us on X
        </Link>
        {isAuthenticated && (
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2  bg-white/0 hover:bg-gray-100 dark:hover:bg-gray-100/10 duration-300 w-full p-3 text-black dark:text-white"
          >
            <span className="text-lg">
              <LuLogOut />
            </span>
            Sign Out
          </button>
        )}
      </div>
      {userData && (
        <div className="flex flex-row items-center gap-2 w-full px-4 text-black dark:text-white">
          <div className="w-10 h-10 rounded-full overflow-hidden">
            <img
              src="/profile.png"
              alt="user"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p className="">{userData?.user?.user_metadata?.full_name}</p>
          </div>
        </div>
      )}
    </div>
  );
}
