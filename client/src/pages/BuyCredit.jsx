import React, { useContext, useState } from 'react';
import { assets, plans } from '../assets/assets';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import { toast } from 'react-toastify';

const BuyCredit = () => {
  const { backendUrl, loadCreditsData } = useContext(AppContext);
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate(); // Corrected to useNavigate hook

  const initpay = async (order) => {
    if (!window.Razorpay) {
      alert('Razorpay SDK not found.');
      return;
    }

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: 'Credits Payment',
      description: 'Credits Payment',
      order_id: order.id,
      handler: async (response) => {
        console.log('Payment Success:', response);
        toast.success('Payment Successful!');
        await loadCreditsData(); // Update credits after successful payment
        const token = await getToken()
        try {
          const {data} = await axios.post(backendUrl+'/api/user/verify-razor', response, {headers:{token}})
          if (data.success) {
            loadCreditsData();
            navigate('/'); // Corrected the navigate function
            toast.success('Credits Added');
          }
        } catch (error) {
          console.log(error);
          toast.error(error.message);
        }
      },
      prefill: {
        name: "Your Name", // Optionally add user's name here
        email: "user@example.com", // Optionally add user's email here
      },
      theme: { color: "#000" },
      modal: {
        ondismiss: () => {
          toast.error('Payment Cancelled!');
        }
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (response) => {
      console.error('Payment Failed:', response);
      toast.error('Payment Failed! Please try again.');
    });
    rzp.open();
  };

  const paymentRazorpay = async (planId) => {
    setLoading(true);
    try {
      const token = await getToken();
      const { data } = await axios.post(
        backendUrl + '/api/user/pay-razor',
        { planId },
        { headers: { token } }
      );

      if (data.success) {
        initpay(data.order);
      } else {
        toast.error('Failed to create order');
      }
    } catch (error) {
      console.log(error);
      toast.error(error.message || 'Something went wrong!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='min-h-[80vh] text-center pt-14 mb-10'>
      <button className='border border-gray-400 px-10 py-2 rounded-full mb-6'>
        Our Plans
      </button>
      <h1 className='text-center text-2xl md:text-3xl lg:text-4xl mt-4 font-semibold bg-gradient-to-r from-gray-900 to-gray-400 bg-clip-text text-transparent mb-6 sm:mb-10'>
        Choose the plan that's right for you
      </h1>
      <div className='flex flex-wrap justify-center gap-6 text-left'>
        {plans.map((item, index) => (
          <div
            className='bg-white drop-shadow-sm border rounded-lg py-12 px-8 text-gray-700 hover:scale-105 transition-all duration-500'
            key={index}
          >
            <img width={40} src={assets.logo_icon} alt="" />
            <p className='mt-3 font-semibold'>{item.id}</p>
            <p className='text-sm'>{item.desc}</p>
            <p className='mt-6'>
              <span className='text-3xl font-medium'>${item.price}</span>/{item.credits} credits
            </p>
            <button
              onClick={() => paymentRazorpay(item.id)}
              className='w-full bg-gray-800 text-white mt-8 text-sm rounded-md py-2.5 min-w-52'
              disabled={loading} // Disable button when loading
            >
              {loading ? 'Processing...' : 'Purchase'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BuyCredit;