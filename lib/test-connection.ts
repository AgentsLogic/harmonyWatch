import { supabase } from './supabase'
import { categoriesService } from './database'

export async function testSupabaseConnection(): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    console.log('Testing Supabase connection...')
    
    // First, just test if we can connect to Supabase
    const { data: authData, error: authError } = await supabase.auth.getSession()
    
    if (authError) {
      console.error('Supabase auth error:', authError)
      return { 
        success: false, 
        message: `Auth connection failed: ${authError.message || JSON.stringify(authError)}` 
      }
    }

    console.log('✅ Supabase auth connection successful!')
    
    // Now test if we can query a simple table
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .limit(1)
      
      if (error) {
        console.warn('Categories table query failed:', error)
        return {
          success: true,
          message: 'Supabase connection successful, but categories table may not exist yet.',
          data: { authConnected: true, tableAccessible: false, error: error.message }
        }
      }

      console.log('✅ Categories table accessible!')
      return {
        success: true,
        message: 'Supabase connection and table access successful!',
        data: { authConnected: true, tableAccessible: true, sampleData: data }
      }
    } catch (tableError) {
      console.warn('Table access failed:', tableError)
      return {
        success: true,
        message: 'Supabase connection successful, but table access failed.',
        data: { authConnected: true, tableAccessible: false, error: tableError }
      }
    }
    
  } catch (error) {
    console.error('Test connection error:', error)
    return {
      success: false,
      message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

// Helper function to run test from browser console
if (typeof window !== 'undefined') {
  (window as any).testSupabase = testSupabaseConnection
}
